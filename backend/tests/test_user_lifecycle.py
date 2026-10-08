"""Real PostgreSQL lifecycle, concurrent completion and API security proofs."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.tests.membership_postgres import LocalPostgres
from backend.app.api import auth
from backend.app.services import passwords, postmark_email
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.user_lifecycle import UserLifecycle, digest, CODE_TTL, SIGNUP, RESET, UNLOCK, CHALLENGE_TTL
from backend.app.services.user_lifecycle_repository import UserLifecycleRepository, LifecycleError


@pytest.fixture
def setup(monkeypatch, tmp_path):
    monkeypatch.setenv('PORTAL_SESSION_SECRET', 'local-lifecycle-test-secret-' * 3)
    monkeypatch.setenv('NODE_ENV', 'test')
    db = LocalPostgres()
    db.migrate()
    now = [datetime.now(timezone.utc)]
    lifecycle = UserLifecycle(UserLifecycleRepository(db.database), clock=lambda: now[0])
    app = FastAPI()
    app.state.auth_repository = CanonicalAuthRepository(db.database)
    app.state.user_lifecycle = lifecycle
    app.include_router(auth.router)
    mail = []
    for purpose, sender in [(SIGNUP, 'send_verification_email'), (RESET, 'send_password_reset_code_email'), (UNLOCK, 'send_settings_unlock_code_email')]:
        monkeypatch.setattr(postmark_email, sender, lambda purpose=purpose, **kw: mail.append((purpose, kw)))
    monkeypatch.setattr(postmark_email, 'send_admin_signup_notification', lambda **kw: None)
    # Every migrated path must work even when JSON identity access explodes.
    from backend.app.compatibility import json_store
    monkeypatch.setattr(json_store, 'load_users', lambda: (_ for _ in ()).throw(AssertionError('JSON authority used')))
    monkeypatch.setattr(json_store, 'save_users', lambda value: (_ for _ in ()).throw(AssertionError('JSON identity write')))
    api = TestClient(app, headers={'X-Requested-With': 'camOS', 'Origin': 'http://testserver'})
    yield api, db, lifecycle, mail, now, app
    db.close()


def signup(setup, username='new-user', email='new@example.com', phone=None, password='  secret123  '):
    api, _, _, mail, _, _ = setup
    response = api.post('/api/signup/start', json=dict(name=username, email=email, phone=phone, password=password))
    assert response.status_code == 202, response.text
    code = mail[-1][1]['code']
    response = api.post('/api/signup/verify', json=dict(email=email, code=code))
    assert response.status_code == 201, response.text
    return response.json()['user']


def login(api, identifier='new-user', password='  secret123  '):
    response = api.post('/api/login', json=dict(identifier=identifier, password=password))
    assert response.status_code == 200, response.text
    return api.cookies.get('camos_session')


def unlock(setup, password='  secret123  '):
    api, _, _, mail, _, _ = setup
    response = api.post('/api/settings/unlock/start', json={'current_password': password})
    assert response.status_code == 200, response.text
    response = api.post('/api/settings/unlock/verify', json={'code': mail[-1][1]['code']})
    assert response.status_code == 200, response.text
    return response.json()['unlockToken']


def test_signup_creates_canonical_username_argon_and_zero_memberships(setup):
    api, db, _, _, _, _ = setup
    account = signup(setup)
    assert account['name'] == 'new-user' and account['phone'] is None
    user_id = int(account['id'])
    assert user_id > 4
    assert db.query('SELECT id FROM public.users WHERE id IN (0,1) ORDER BY id') == [[0], [1]]
    row = db.query('SELECT password_hash,created_at,session_version FROM public.users WHERE id=%s', (user_id,))[0]
    assert row[0].startswith('$argon2id$') and passwords.verify_password('  secret123  ', row[0])
    assert row[1] is not None and row[2] == 0
    assert db.query("SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='created_at'") == [[None]]
    assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges') == [[0]]
    assert db.query('SELECT count(*) FROM public.memberships WHERE user_id=%s', (user_id,)) == [[0]]
    for identifier in ('NEW-USER', 'NEW@EXAMPLE.COM'):
        login(api, identifier)
        assert api.get('/api/me').json()['user']['name'] == 'new-user'
        assert app_repository(setup).organisations(user_id) == []
    assert api.post('/api/login', json={'identifier': 'new-user', 'password': 'secret123'}).status_code == 401
    assert api.post('/api/signup/verify', json={'email': account['email'], 'code': '123456'}).status_code == 400


def app_repository(setup):
    return setup[5].state.auth_repository


@pytest.mark.parametrize('username,email,expected', [('unique','OWNER@EXAMPLE.COM','Email'), ('OWNER','unique@example.com','Username'), ('member@example.com','unique@example.com','Username'), ('unique','member','email')])
def test_signup_duplicate_and_identifier_validation(setup, username, email, expected):
    api, db, *_ = setup
    response = api.post('/api/signup/start', json=dict(name=username,email=email,password='password123'))
    assert response.status_code in (409,422), response.text
    assert expected.lower() in str(response.json()).lower()
    assert db.query('SELECT count(*) FROM public.users') == [[5]]


def test_wrong_code_attempts_commit_and_exhaustion(setup):
    api, db, _, mail, _, _ = setup
    api.post('/api/signup/start', json=dict(name='new-user',email='new@example.com',password='password123'))
    wrong = '000000' if mail[-1][1]['code'] != '000000' else '000001'
    for attempt in range(5):
        response = api.post('/api/signup/verify', json=dict(email='new@example.com',code=wrong))
        assert response.status_code == (429 if attempt == 4 else 400)
    assert db.query('SELECT attempts FROM public.user_lifecycle_challenges') == [[5]]
    assert api.post('/api/signup/verify', json=dict(email='new@example.com',code=mail[-1][1]['code'])).status_code == 429
    # Starting another challenge is intentionally not a global rate limit.
    assert api.post('/api/signup/start', json=dict(name='new-user',email='new@example.com',password='password123')).status_code == 202


def test_expired_code_resend_does_not_restore_attempts(setup):
    api, db, _, mail, now, _ = setup
    api.post('/api/signup/start', json=dict(name='new-user',email='new@example.com',password='password123'))
    original = mail[-1][1]['code']
    wrong = '000000' if original != '000000' else '000001'
    assert api.post('/api/signup/verify', json=dict(email='new@example.com',code=wrong)).status_code == 400
    assert api.post('/api/signup/resend', json={'email':'new@example.com'}).status_code == 429
    now[0] += timedelta(seconds=CODE_TTL)
    assert api.post('/api/signup/verify', json=dict(email='new@example.com',code=original)).status_code == 410
    assert api.post('/api/signup/resend', json={'email':'new@example.com'}).status_code == 200
    assert db.query('SELECT attempts FROM public.user_lifecycle_challenges') == [[1]]
    assert api.post('/api/signup/verify', json=dict(email='new@example.com',code=mail[-1][1]['code'])).status_code == 201


def test_resend_limit_and_code_invalidation(setup):
    _, db, lifecycle, _, now, _ = setup
    handle, (_, first_code) = lifecycle.start(SIGNUP,'new@example.com',username='new-user',password='password123')
    for _ in range(5):
        now[0] += timedelta(seconds=30)
        _, code, _ = lifecycle.resend(SIGNUP,handle)
    with pytest.raises(LifecycleError) as error:
        lifecycle.resend(SIGNUP,handle)
    assert error.value.status == 429
    assert db.query('SELECT resends FROM public.user_lifecycle_challenges') == [[5]]
    # Challenge digest contains no plaintext code or password.
    payload, hashed = db.query('SELECT payload,code_hash FROM public.user_lifecycle_challenges')[0]
    assert 'password' not in payload and payload['password_hash'].startswith('$argon2')
    assert len(hashed) == 64


def test_parallel_completion_and_cross_browser_signup_isolation(setup):
    _, db, lifecycle, _, _, _ = setup
    handle, (_, code) = lifecycle.start(SIGNUP,'new@example.com',username='first-user',password='password123')
    other, _ = lifecycle.start(SIGNUP,'new@example.com',username='second-user',password='different123')
    def complete(_):
        try: return lifecycle.verify(SIGNUP,handle,code).username
        except LifecycleError as error: return error.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(complete, range(2)))
    assert sorted(map(str,results)) == ['400','first-user']
    assert db.query('SELECT username FROM public.users WHERE email=%s', ('new@example.com',)) == [['first-user']]
    assert db.query("SELECT verified_at,consumed_at FROM public.user_lifecycle_challenges WHERE id=%s", (digest(other),)) == [[None,None]]


def test_admin_notification_failure_cannot_undo_signup(setup, monkeypatch):
    def fail(**kw): raise postmark_email.PostmarkConfigurationError('not configured')
    monkeypatch.setattr(postmark_email,'send_admin_signup_notification',fail)
    account = signup(setup)
    assert setup[1].query('SELECT username FROM public.users WHERE id=%s',(int(account['id']),)) == [['new-user']]
    login(setup[0])


def test_verification_email_failure_is_recoverable(setup, monkeypatch):
    api, db, _, mail, now, _ = setup
    def fail(**kw): raise postmark_email.PostmarkDeliveryError(status_code=500,response_body='private provider body',error_code=None,error_message=None,from_email='sender@example.com',to_email_masked='***')
    monkeypatch.setattr(postmark_email,'send_verification_email',fail)
    response=api.post('/api/signup/start',json=dict(name='new-user',email='new@example.com',password='password123'))
    assert response.status_code == 502 and 'private' not in response.text
    assert api.cookies.get('camos_signup_challenge')
    assert db.query('SELECT count(*) FROM public.users') == [[5]]
    now[0] += timedelta(seconds=30)
    monkeypatch.setattr(postmark_email,'send_verification_email',lambda **kw: mail.append((SIGNUP,kw)))
    assert api.post('/api/signup/resend',json={'email':'new@example.com'}).status_code == 200
    assert api.post('/api/signup/verify',json=dict(email='new@example.com',code=mail[-1][1]['code'])).status_code == 201


def test_reset_changes_canonical_password_revokes_session_and_prevents_replay(setup):
    api, _, _, mail, now, _ = setup
    signup(setup); old_cookie=login(api)
    response=api.post('/api/password-reset/start',json={'email':'new@example.com'})
    assert response.status_code == 202
    code=mail[-1][1]['code']
    now[0] += timedelta(seconds=CODE_TTL-1)
    response=api.post('/api/password-reset/verify-code',json={'email':'new@example.com','code':code})
    assert response.status_code == 200 and 'resetToken' not in response.text
    assert api.post('/api/password-reset/verify-code',json={'email':'new@example.com','code':code}).status_code == 400
    # A verified challenge remains valid after the original code expires.
    now[0] += timedelta(seconds=60)
    challenge=api.cookies.get('camos_reset_challenge')
    assert api.post('/api/password-reset/set-password',json={'email':'new@example.com','password':'newpassword123','confirm_password':'newpassword123'}).status_code == 200
    assert api.get('/api/me').status_code == 401
    assert api.post('/api/login',json={'identifier':'new-user','password':'  secret123  '}).status_code == 401
    login(api,password='newpassword123')
    assert api.get('/api/me',headers={'Cookie':'camos_session='+old_cookie}).status_code == 401
    assert api.post('/api/password-reset/set-password',headers={'Cookie':f'camos_reset_challenge={challenge}'},json={'email':'new@example.com','password':'replayed123','confirm_password':'replayed123'}).status_code == 401


def test_unknown_disabled_reset_and_provider_failure_are_generic(setup,monkeypatch):
    api, db, _, mail, _, _=setup
    before=len(mail)
    unknown=api.post('/api/password-reset/start',json={'email':'unknown@example.com'})
    unknown_resend=api.post('/api/password-reset/resend',json={'email':'unknown@example.com'})
    disabled=api.post('/api/password-reset/start',json={'email':'disabled@example.com'})
    assert unknown.status_code == disabled.status_code == 202 and len(mail)==before
    assert api.post('/api/password-reset/resend',json={'email':'disabled@example.com'}).json()==unknown_resend.json()
    assert db.query('SELECT status FROM public.users WHERE id=3')==[[0]]
    signup(setup)
    monkeypatch.setattr(postmark_email,'send_password_reset_code_email',lambda **kw: (_ for _ in ()).throw(RuntimeError('private')))
    assert api.post('/api/password-reset/start',json={'email':'new@example.com'}).status_code==202


def test_reset_wrong_expired_code_and_disabled_before_completion(setup):
    api,db,_,mail,now,_=setup
    signup(setup)
    api.post('/api/password-reset/start',json={'email':'new@example.com'})
    code=mail[-1][1]['code']
    assert api.post('/api/password-reset/verify-code',json={'email':'new@example.com','code':'not-code'}).status_code==400
    now[0]+=timedelta(seconds=901)
    assert api.post('/api/password-reset/verify-code',json={'email':'new@example.com','code':code}).status_code==410
    assert api.post('/api/password-reset/resend',json={'email':'new@example.com'}).status_code==200
    assert api.post('/api/password-reset/verify-code',json={'email':'new@example.com','code':mail[-1][1]['code']}).status_code==200
    db.query("UPDATE public.users SET status=0 WHERE email='new@example.com'")
    assert api.post('/api/password-reset/set-password',json={'email':'new@example.com','password':'password999','confirm_password':'password999'}).status_code==401


def test_account_unlock_edit_phone_username_and_password(setup):
    api,db,_,_,_,_=setup
    account=signup(setup,phone='+447700900123'); old_cookie=login(api)
    assert api.post('/api/settings/unlock/start',json={'current_password':'wrong'}).status_code==401
    token=unlock(setup)
    def update(**fields): return api.put('/api/me',json={'unlock_token':token,**fields})
    assert update(name='OWNER').status_code==409
    assert update(email='changed@example.com').status_code==422
    response=update(name='renamed-user')
    assert response.status_code==200 and response.json()['user']['name']=='renamed-user'
    assert api.get('/api/me').json()['user']['phone']=='+447700900123'
    assert update(phone='').status_code==200
    assert api.get('/api/me').json()['user']['phone'] is None
    assert update(phone='+15551234567').status_code==200
    assert update(password='  changed123  ',confirm_password='  changed123  ').status_code==200
    assert api.get('/api/me').status_code==200
    assert api.get('/api/me',headers={'Cookie':'camos_session='+old_cookie}).status_code==401
    assert update(phone='').status_code==401
    login(api,'renamed-user','  changed123  ')
    assert api.get('/api/me').json()['user']['phone']=='+15551234567'
    signup(setup,username='new-user',email='another@example.com')
    login(api,'new-user')


def test_unlock_is_user_scoped_code_one_time_and_expires(setup):
    api,db,_,mail,now,app=setup
    signup(setup);login(api);token=unlock(setup)
    assert api.post('/api/settings/unlock/verify',json={'code':mail[-1][1]['code']}).status_code==400
    second=TestClient(app,headers={'X-Requested-With':'camOS'})
    db.query('UPDATE public.users SET password_hash=%s WHERE id=0',(passwords.hash_password('password123'),))
    login(second,'owner','password123')
    second.cookies.set('camos_unlock_challenge',api.cookies.get('camos_unlock_challenge'))
    assert second.put('/api/me',json={'unlock_token':token,'phone':''}).status_code==401
    now[0]+=timedelta(seconds=300)
    assert api.put('/api/me',json={'unlock_token':token,'phone':''}).status_code==401


@pytest.mark.parametrize('path,payload',[('/api/signup/start',{'name':'new','email':'a@example.com','password':'password123'}),('/api/password-reset/start',{'email':'a@example.com'}),('/api/login',{'identifier':'owner','password':'wrong'}),('/api/logout',{}),('/api/create-account',{})])
def test_cross_site_mutations_and_no_store(setup,path,payload):
    api,*_=setup
    response=api.post(path,json=payload,headers={'Origin':'https://evil.example','Sec-Fetch-Site':'cross-site'})
    assert response.status_code==403 and response.headers['cache-control']=='no-store'
    response=api.post(path,json=payload,headers={'X-Requested-With':''})
    assert response.status_code==403


def test_retired_routes_and_validation_do_not_echo_secrets(setup):
    api,*_=setup
    assert api.post('/api/create-account',json={}).status_code==410
    assert api.post('/api/password-reset/verify',json={}).status_code==410
    secret='x'*1025
    response=api.post('/api/signup/start',json={'name':'new','email':'a@example.com','password':secret})
    assert response.status_code==422 and secret not in response.text


def test_parallel_reset_completions_only_one_wins(setup):
    api,db,lifecycle,_,_,_=setup
    account=signup(setup)
    handles=[]
    for _ in range(2):
        handle,(_,code)=lifecycle.start(RESET,account['email'])
        lifecycle.verify(RESET,handle,code)
        handles.append(handle)
    def finish(handle):
        try:
            lifecycle.reset_password(handle,'newpassword123','newpassword123')
            return 200
        except LifecycleError as error:
            return error.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(finish,handles))==[200,401]
    assert db.query('SELECT session_version FROM public.users WHERE id=%s',(int(account['id']),))==[[1]]


def test_reset_verified_expiry_and_wrong_handle(setup):
    _,_,lifecycle,_,now,_=setup
    account=signup(setup)
    handle,(_,code)=lifecycle.start(RESET,account['email'])
    lifecycle.verify(RESET,handle,code)
    with pytest.raises(LifecycleError):
        lifecycle.reset_password('wrong','password123','password123')
    now[0]+=timedelta(seconds=600)
    with pytest.raises(LifecycleError) as error:
        lifecycle.reset_password(handle,'password123','password123')
    assert error.value.status==401


def test_runtime_grants_support_lifecycle_and_cleanup_without_ddl(setup):
    from contextlib import closing, contextmanager
    from uuid import uuid4
    _,db,_,_,_,_=setup
    role='lifecycle_test_'+uuid4().hex
    db.query(f'CREATE ROLE "{role}"')
    try:
        grant_source=(Path(__file__).resolve().parents[1]/'migrations/002_canonical_user_lifecycle_grants.sql').read_text()
        db.query(grant_source.replace(':"portal_db_user"',f'"{role}"'))
        class LimitedDatabase:
            @contextmanager
            def transaction(self):
                with db.database.transaction() as connection:
                    with closing(connection.cursor()) as cursor:
                        cursor.execute(f'SET LOCAL ROLE "{role}"')
                    yield connection
        lifecycle=UserLifecycle(UserLifecycleRepository(LimitedDatabase()))
        handle,(_,code)=lifecycle.start(SIGNUP,'limited@example.com',username='limited-user',password='password123')
        account=lifecycle.verify(SIGNUP,handle,code)
        handle,(_,code)=lifecycle.start(UNLOCK,account.email,user=account)
        token=lifecycle.verify(UNLOCK,handle,code,account)
        updated=lifecycle.update_account(account,handle,{'name':'limited-renamed','phone':''})
        assert updated.username=='limited-renamed'
        handle,(_,code)=lifecycle.start(RESET,account.email)
        token=lifecycle.verify(RESET,handle,code)
        lifecycle.reset_password(handle,'password999','password999')
        lifecycle.start(SIGNUP,'abandoned@example.com',username='abandoned-user',password='password123')
        lifecycle.clock=lambda: datetime.now(timezone.utc)+timedelta(seconds=CHALLENGE_TTL+1)
        assert lifecycle.cleanup_expired()==1
        for sql in ['ALTER TABLE public.users ADD COLUMN forbidden integer',
                    'DELETE FROM public.users']:
            with pytest.raises(Exception):
                lifecycle.repository.transact(lambda cursor: cursor.execute(sql))
    finally:
        db.query(f'DROP OWNED BY "{role}"');db.query(f'DROP ROLE "{role}"')


def test_legacy_password_auth_is_disabled_in_production(monkeypatch):
    from backend.app.compatibility.password_auth import require_legacy_password_auth
    from fastapi import HTTPException
    monkeypatch.setenv('NODE_ENV','production');monkeypatch.setenv('PORTAL_LEGACY_PASSWORD_AUTH','true')
    with pytest.raises(HTTPException) as error: require_legacy_password_auth()
    assert error.value.status_code==410


def test_schema_matches_locked_live_contract(setup):
    _, db, _, _, _, _ = setup
    def columns(table):
        return db.query('SELECT column_name,data_type FROM information_schema.columns '
                        'WHERE table_schema=\'public\' AND table_name=%s ORDER BY ordinal_position', (table,))
    assert columns('users') == [[name, kind] for name, kind in (
        ('id','bigint'),('email','text'),('username','text'),('phone_number','text'),
        ('password_hash','text'),('status','smallint'),('created_at','timestamp with time zone'),
        ('session_version','bigint'))]
    assert columns('user_lifecycle_challenges') == [[name, kind] for name, kind in (
        ('id','text'),('purpose','smallint'),('user_id','bigint'),('payload','jsonb'),
        ('code_hash','text'),('code_expires_at','timestamp with time zone'),('attempts','smallint'),
        ('resends','smallint'),('last_sent_at','timestamp with time zone'),
        ('verified_at','timestamp with time zone'),('consumed_at','timestamp with time zone'),
        ('created_at','timestamp with time zone'))]
    assert db.query("SELECT is_identity,identity_generation FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name='users' AND column_name='id'") == [['YES','BY DEFAULT']]
    assert db.query("SELECT pg_get_serial_sequence('public.users','id')") == [['public.users_id_seq']]
    assert db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'user_lifecycle_%' ORDER BY tablename") == [['user_lifecycle_challenges']]
    assert db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='users' ORDER BY indexname") == [['uq_users_email_ci'],['uq_users_username_ci'],['users_pkey']]
    with pytest.raises(Exception):
        db.query("INSERT INTO public.user_lifecycle_challenges(id,purpose,code_hash,code_expires_at) VALUES ('bad',3,'bad',now())")


def test_login_is_independent_of_temporary_lifecycle_storage(setup):
    from backend.app.services.session_tokens import verify_session_claims
    api, db, _, _, _, _ = setup
    db.query('UPDATE public.users SET password_hash=%s,session_version=7 WHERE id=0',
             (passwords.hash_password('password123'),))
    db.query('DROP TABLE public.user_lifecycle_challenges')
    for identifier in ('OWNER', 'OWNER@EXAMPLE.COM'):
        cookie = login(api, identifier, 'password123')
        assert verify_session_claims(cookie) == (0,7)
        assert api.get('/api/me').status_code == 200
    db.query('UPDATE public.users SET session_version=session_version+1 WHERE id=0')
    assert api.get('/api/me').status_code == 401


def test_signup_pending_payload_and_identity_sequence(setup):
    api, db, _, mail, _, _ = setup
    db.query("SELECT setval('public.users_id_seq',8000,false)")
    assert api.post('/api/signup/start',json={'name':'chosen','email':'CHOSEN@example.com','phone':'+15551234567','password':'  password123  '}).status_code == 202
    handle = api.cookies.get('camos_signup_challenge')
    row = db.query('SELECT id,purpose,user_id,payload,code_hash,verified_at,consumed_at FROM public.user_lifecycle_challenges')[0]
    assert row[0] == digest(handle) and handle not in str(row)
    assert row[1:3] == [0,None]
    payload = row[3]
    assert set(payload) == {'email','username','phone','password_hash'}
    assert payload['email']=='chosen@example.com' and payload['username']=='chosen' and payload['phone']=='+15551234567'
    assert passwords.verify_password('  password123  ',payload['password_hash'])
    assert '  password123  ' not in str(row) and mail[-1][1]['code'] not in row[4]
    assert row[5:] == [None,None]
    assert db.query('SELECT count(*) FROM public.users') == [[5]]
    response = api.post('/api/signup/verify',json={'email':'chosen@example.com','code':mail[-1][1]['code']})
    assert response.status_code == 201 and response.json()['user']['id']=='8000'
    assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges') == [[0]]
    assert db.query('SELECT created_at,session_version FROM public.users WHERE id=8000')[0][0] is not None


def test_migration_preserves_identity_ids_and_a_sequence_already_ahead(setup):
    _,db,_,_,_,_=setup
    db.query("SELECT setval('public.users_id_seq',9000,false)")
    source=(Path(__file__).resolve().parents[1]/'migrations/002_canonical_user_lifecycle.sql').read_text()
    db.query(source)
    assert db.query('SELECT id FROM public.users WHERE id IN (0,1) ORDER BY id')==[[0],[1]]
    assert db.query("SELECT nextval('public.users_id_seq')")==[[9000]]


@pytest.mark.parametrize('purpose', [RESET,UNLOCK])
def test_reset_and_unlock_code_lifecycle_uses_existing_columns(setup,purpose,monkeypatch):
    _, db, lifecycle, _, now, app = setup
    account=signup(setup)
    user=app.state.auth_repository.get_enabled_user(int(account['id']))
    handle,(_,code)=lifecycle.start(purpose,account['email'],user=user if purpose==UNLOCK else None)
    assert db.query('SELECT purpose,user_id,payload FROM public.user_lifecycle_challenges') == [[purpose,user.id,{}]]
    wrong='000000' if code!='000000' else '000001'
    with pytest.raises(LifecycleError): lifecycle.verify(purpose,handle,wrong,user if purpose==UNLOCK else None)
    assert db.query('SELECT attempts FROM public.user_lifecycle_challenges') == [[1]]
    now[0]+=timedelta(seconds=CODE_TTL)
    with pytest.raises(LifecycleError) as error: lifecycle.verify(purpose,handle,code,user if purpose==UNLOCK else None)
    assert error.value.status == 410
    monkeypatch.setattr('backend.app.services.user_lifecycle.secrets.randbelow',lambda limit: 222222 if code!='222222' else 333333)
    _,replacement,_=lifecycle.resend(purpose,handle,user if purpose==UNLOCK else None)
    assert replacement != code
    assert db.query('SELECT attempts,resends FROM public.user_lifecycle_challenges') == [[1,1]]
    with pytest.raises(LifecycleError): lifecycle.verify(purpose,handle,code,user if purpose==UNLOCK else None)
    assert lifecycle.verify(purpose,handle,replacement,user if purpose==UNLOCK else None) == handle
    assert db.query('SELECT verified_at,consumed_at FROM public.user_lifecycle_challenges')[0] == [now[0],None]
    with pytest.raises(LifecycleError): lifecycle.resend(purpose,handle,user if purpose==UNLOCK else None)
    with pytest.raises(LifecycleError): lifecycle.verify(purpose,handle,replacement,user if purpose==UNLOCK else None)


def test_reset_requires_verified_row_and_deletes_after_completion(setup):
    _, db, lifecycle, _, _, _=setup
    account=signup(setup)
    handle,(_,code)=lifecycle.start(RESET,account['email'])
    with pytest.raises(LifecycleError): lifecycle.reset_password(handle,'password123','password123')
    lifecycle.verify(RESET,handle,code)
    lifecycle.reset_password(handle,'password123','password123')
    assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges') == [[0]]
    row=db.query('SELECT password_hash,session_version FROM public.users WHERE id=%s',(int(account['id']),))[0]
    assert row[0].startswith('$argon2id$') and row[1]==1
    with pytest.raises(LifecycleError): lifecycle.reset_password(handle,'password999','password999')


@pytest.mark.parametrize('ending', ['explicit','logout','password'])
def test_unlock_ending_removes_authorization(setup,ending):
    api,db,_,_,_,_=setup
    signup(setup);login(api);handle=unlock(setup)
    assert api.put('/api/me',json={'unlock_token':handle,'phone':'+15551234567'}).status_code==200
    assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges WHERE purpose=2') == [[1]]
    if ending=='explicit': assert api.post('/api/settings/unlock/end').status_code==204
    elif ending=='logout': assert api.post('/api/logout').status_code==204
    else: assert api.put('/api/me',json={'unlock_token':handle,'password':'newpassword123','confirm_password':'newpassword123'}).status_code==200
    assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges WHERE purpose=2') == [[0]]
    assert api.put('/api/me',json={'unlock_token':handle,'phone':''}).status_code==401


def test_password_change_invalidates_pending_and_verified_reset_and_unlock_rows(setup):
    api,db,lifecycle,_,_,app=setup
    account=signup(setup);login(api);handle=unlock(setup)
    user=app.state.auth_repository.get_enabled_user(int(account['id']))
    pending,_=lifecycle.start(RESET,account['email'])
    verified,(_,code)=lifecycle.start(RESET,account['email']);lifecycle.verify(RESET,verified,code)
    lifecycle.start(UNLOCK,account['email'],user=user)
    assert api.put('/api/me',json={'unlock_token':handle,'password':'newpassword123','confirm_password':'newpassword123'}).status_code==200
    assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges WHERE user_id=%s',(user.id,)) == [[0]]
    with pytest.raises(LifecycleError): lifecycle.reset_password(verified,'password999','password999')


@pytest.mark.parametrize('purpose,verified', [(SIGNUP,False),(RESET,False),(UNLOCK,False),(RESET,True),(UNLOCK,True)])
def test_cleanup_deletes_only_expired_journeys(setup,purpose,verified):
    _,db,lifecycle,_,now,app=setup
    account=signup(setup);user=app.state.auth_repository.get_enabled_user(int(account['id']))
    def start(email,username):
        return lifecycle.start(purpose,email,username=username,password='password123',user=user if purpose==UNLOCK else None)
    expired,(_,code)=start('expired@example.com' if purpose==SIGNUP else account['email'],'expired-user')
    if verified: lifecycle.verify(purpose,expired,code,user if purpose==UNLOCK else None)
    now[0]+=timedelta(seconds=(600 if purpose==RESET else 300) if verified else CHALLENGE_TTL)
    active,(_,code)=start('active@example.com' if purpose==SIGNUP else account['email'],'active-user')
    if verified: lifecycle.verify(purpose,active,code,user if purpose==UNLOCK else None)
    assert lifecycle.cleanup_expired() == 1
    assert db.query('SELECT id FROM public.user_lifecycle_challenges') == [[digest(active)]]
    assert lifecycle.cleanup_expired() == 0


def test_cleanup_is_bounded_and_provider_calls_are_after_commit(setup,monkeypatch):
    api,db,lifecycle,mail,now,_=setup
    for i in range(4): lifecycle.start(SIGNUP,f'old{i}@example.com',username=f'old{i}',password='password123')
    now[0]+=timedelta(seconds=CHALLENGE_TTL)
    assert lifecycle.cleanup_expired(limit=2)==2
    assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges')==[[2]]
    assert lifecycle.cleanup_expired(limit=2)==2
    def sent(**kw):
        # A separate connection sees the challenge and can lock it immediately;
        # therefore Postmark runs after commit, outside its transaction.
        assert db.query('SELECT count(*) FROM public.user_lifecycle_challenges') == [[1]]
        with db.database.transaction() as connection:
            cursor=connection.cursor()
            try: cursor.execute('SELECT id FROM public.user_lifecycle_challenges FOR UPDATE NOWAIT')
            finally: cursor.close()
        mail.append((SIGNUP,kw))
    monkeypatch.setattr(postmark_email,'send_verification_email',sent)
    assert api.post('/api/signup/start',json={'name':'provider','email':'provider@example.com','password':'password123'}).status_code==202


def test_cleanup_failure_cannot_fail_a_valid_request(setup,monkeypatch):
    api,_,lifecycle,_,_,_=setup
    def unavailable(*args,**kwargs): raise RuntimeError('private SQL details')
    monkeypatch.setattr(lifecycle.repository,'cleanup',unavailable)
    account=signup(setup);assert account['name']=='new-user'
    login(api)
