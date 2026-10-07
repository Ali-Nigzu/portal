"""Real PostgreSQL lifecycle, concurrent completion and API security proofs."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.tests.membership_postgres import LocalPostgres
from backend.app.api import auth, documents
from backend.app.services import passwords, postmark_email
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.user_lifecycle import UserLifecycle, digest, CODE_TTL
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
    app.include_router(documents.router)
    mail = []
    for purpose, sender in [('signup', 'send_verification_email'), ('reset', 'send_password_reset_code_email'), ('unlock', 'send_settings_unlock_code_email')]:
        monkeypatch.setattr(postmark_email, sender, lambda purpose=purpose, **kw: mail.append((purpose, kw)))
    monkeypatch.setattr(postmark_email, 'send_admin_signup_notification', lambda **kw: None)
    # Every migrated path must work even when JSON identity access explodes.
    from backend.app.data import json_store, documents_store
    monkeypatch.setattr(json_store, 'load_users', lambda: (_ for _ in ()).throw(AssertionError('JSON authority used')))
    monkeypatch.setattr(json_store, 'save_users', lambda value: (_ for _ in ()).throw(AssertionError('JSON identity write')))
    monkeypatch.setattr(documents_store, 'DOCUMENTS_FILE', str(tmp_path / 'documents.json'))
    monkeypatch.setattr(documents_store, 'DOCUMENT_BLOBS_DIR', str(tmp_path / 'blobs'))
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
    row = db.query('SELECT password_hash,document_owner_key FROM public.users WHERE id=%s', (user_id,))[0]
    assert row[0].startswith('$argon2id$') and passwords.verify_password('  secret123  ', row[0])
    assert row[1].startswith('canonical:')
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


def test_wrong_code_attempts_commit_and_restart_budget(setup):
    api, db, _, mail, _, _ = setup
    api.post('/api/signup/start', json=dict(name='new-user',email='new@example.com',password='password123'))
    wrong = '000000' if mail[-1][1]['code'] != '000000' else '000001'
    for attempt in range(5):
        response = api.post('/api/signup/verify', json=dict(email='new@example.com',code=wrong))
        assert response.status_code == (429 if attempt == 4 else 400)
    assert db.query('SELECT attempts,state FROM public.user_lifecycle_challenges') == [[5,'exhausted']]
    assert api.post('/api/signup/verify', json=dict(email='new@example.com',code=mail[-1][1]['code'])).status_code == 400
    for _ in range(9):
        assert api.post('/api/signup/start', json=dict(name='new-user',email='new@example.com',password='password123')).status_code == 202
    assert api.post('/api/signup/start', json=dict(name='new-user',email='new@example.com',password='password123')).status_code == 429


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
    handle, (_, first_code) = lifecycle.start('signup','new@example.com',username='new-user',password='password123')
    for _ in range(5):
        now[0] += timedelta(seconds=30)
        _, code, _ = lifecycle.resend('signup',handle)
    with pytest.raises(LifecycleError) as error:
        lifecycle.resend('signup',handle)
    assert error.value.status == 429
    assert db.query('SELECT resends FROM public.user_lifecycle_challenges') == [[5]]
    # Challenge digest contains no plaintext code or password.
    payload, hashed = db.query('SELECT payload,code_hash FROM public.user_lifecycle_challenges')[0]
    assert 'password' not in payload and payload['password_hash'].startswith('$argon2')
    assert len(hashed) == 64


def test_parallel_completion_and_cross_browser_signup_isolation(setup):
    _, db, lifecycle, _, _, _ = setup
    handle, (_, code) = lifecycle.start('signup','new@example.com',username='first-user',password='password123')
    other, _ = lifecycle.start('signup','new@example.com',username='second-user',password='different123')
    def complete(_):
        try: return lifecycle.verify('signup',handle,code).username
        except LifecycleError as error: return error.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(complete, range(2)))
    assert sorted(map(str,results)) == ['400','first-user']
    assert db.query('SELECT username FROM public.users WHERE email=%s', ('new@example.com',)) == [['first-user']]
    assert db.query("SELECT state FROM public.user_lifecycle_challenges WHERE id=%s", (digest(other),)) == [['pending']]


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
    monkeypatch.setattr(postmark_email,'send_verification_email',lambda **kw: mail.append(('signup',kw)))
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
    # A verified grant remains valid after the original code expires.
    now[0] += timedelta(seconds=60)
    challenge=api.cookies.get('camos_reset_challenge'); grant=api.cookies.get('camos_reset_grant')
    assert api.post('/api/password-reset/set-password',json={'email':'new@example.com','password':'newpassword123','confirm_password':'newpassword123'}).status_code == 200
    assert api.get('/api/me').status_code == 401
    assert api.post('/api/login',json={'identifier':'new-user','password':'  secret123  '}).status_code == 401
    login(api,password='newpassword123')
    assert api.get('/api/me',headers={'Cookie':'camos_session='+old_cookie}).status_code == 401
    assert api.post('/api/password-reset/set-password',headers={'Cookie':f'camos_reset_challenge={challenge}; camos_reset_grant={grant}'},json={'email':'new@example.com','password':'replayed123','confirm_password':'replayed123'}).status_code == 401


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


def test_account_unlock_edit_phone_username_password_and_documents(setup):
    api,db,_,_,_,_=setup
    account=signup(setup,phone='+447700900123'); old_cookie=login(api)
    assert api.post('/api/settings/unlock/start',json={'current_password':'wrong'}).status_code==401
    token=unlock(setup)
    upload=api.post('/api/documents/upload',files={'files':('account.csv',b'a,b\n1,2','text/csv')})
    assert upload.status_code==200
    document_id=upload.json()['documents'][0]['id']
    def update(**fields): return api.put('/api/me',json={'unlock_token':token,**fields})
    assert update(name='OWNER').status_code==409
    assert update(email='changed@example.com').status_code==422
    response=update(name='renamed-user',account_version=account['account_version'])
    assert response.status_code==200 and response.json()['user']['name']=='renamed-user'
    assert update(phone='',account_version=0).status_code==409
    assert update(phone='').status_code==200
    assert api.get('/api/me').json()['user']['phone'] is None
    assert update(phone='+15551234567').status_code==200
    assert api.get('/api/documents').json()['documents'][0]['id']==document_id
    assert api.get('/api/documents/'+document_id+'/download').content==b'a,b\n1,2'
    assert update(password='  changed123  ',confirm_password='  changed123  ').status_code==200
    assert api.get('/api/me').status_code==200
    assert api.get('/api/me',headers={'Cookie':'camos_session='+old_cookie}).status_code==401
    assert update(phone='').status_code==401
    login(api,'renamed-user','  changed123  ')
    assert api.get('/api/me').json()['user']['phone']=='+15551234567'
    signup(setup,username='new-user',email='another@example.com')
    login(api,'new-user')
    assert api.get('/api/documents/'+document_id+'/download').status_code==404


def test_unlock_is_browser_bound_code_one_time_and_expires(setup):
    api,_,_,mail,now,app=setup
    signup(setup);login(api);token=unlock(setup)
    assert api.post('/api/settings/unlock/verify',json={'code':mail[-1][1]['code']}).status_code==400
    second=TestClient(app,headers={'X-Requested-With':'camOS'})
    login(second)
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


def test_existing_document_namespace_survives_rename(setup):
    api,db,_,_,_,_=setup
    db.query('UPDATE public.users SET password_hash=%s WHERE id=0',(passwords.hash_password('password123'),))
    login(api,'owner','password123');token=unlock(setup,'password123')
    from backend.app.data import documents_store
    documents_store._save_all_documents([dict(id='historical',accountId='owner',name='original.csv',type='csv',mimeType='text/csv',sizeBytes=1,createdAt='2026-01-01T00:00:00Z',updatedAt='2026-01-01T00:00:00Z',status='active')])
    assert api.put('/api/me',json={'unlock_token':token,'name':'renamed-owner'}).status_code==200
    assert db.query('SELECT document_owner_key FROM public.users WHERE id=0')==[['owner']]
    assert api.get('/api/documents').json()['documents'][0]['id']=='historical'
    signup(setup,username='owner',email='replacement@example.com');login(api,'owner')
    assert api.get('/api/documents').json()['documents']==[]


def test_parallel_reset_completions_only_one_wins(setup):
    api,db,lifecycle,_,_,_=setup
    account=signup(setup)
    grants=[]
    for _ in range(2):
        handle,(_,code)=lifecycle.start('reset',account['email'])
        grants.append((handle,lifecycle.verify('reset',handle,code)))
    def finish(pair):
        try:
            lifecycle.reset_password(*pair,'newpassword123','newpassword123')
            return 200
        except LifecycleError as error:
            return error.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(finish,grants))==[200,401]
    assert db.query('SELECT session_version FROM public.users WHERE id=%s',(int(account['id']),))==[[1]]


def test_reset_grant_expiry_independent_of_code_and_wrong_grant(setup):
    _,_,lifecycle,_,now,_=setup
    account=signup(setup)
    handle,(_,code)=lifecycle.start('reset',account['email'])
    grant=lifecycle.verify('reset',handle,code)
    with pytest.raises(LifecycleError):
        lifecycle.reset_password(handle,'wrong','password123','password123')
    now[0]+=timedelta(seconds=600)
    with pytest.raises(LifecycleError) as error:
        lifecycle.reset_password(handle,grant,'password123','password123')
    assert error.value.status==401


def test_runtime_grants_are_sufficient_without_ddl_or_owner_updates(setup):
    from contextlib import closing, contextmanager
    from uuid import uuid4
    _,db,_,_,_,_=setup
    role='lifecycle_test_'+uuid4().hex
    db.query(f'CREATE ROLE "{role}"')
    try:
        # Execute the exact statements from the reviewed grant source, including
        # its dynamically resolved generated sequence name.
        grant_source=(Path(__file__).resolve().parents[1]/'migrations/002_canonical_user_lifecycle_grants.sql').read_text()
        prefix=grant_source[:grant_source.index('SELECT format')].replace(':"portal_db_user"',f'"{role}"')
        suffix=grant_source[grant_source.index('GRANT SELECT, INSERT, UPDATE ON'):].replace(':"portal_db_user"',f'"{role}"')
        sequence=db.query("SELECT pg_get_serial_sequence('public.users','id')")[0][0]
        db.query(prefix+f'GRANT USAGE ON SEQUENCE {sequence} TO "{role}";'+suffix)
        class LimitedDatabase:
            @contextmanager
            def transaction(self):
                with db.database.transaction() as connection:
                    with closing(connection.cursor()) as cursor:
                        cursor.execute(f'SET LOCAL ROLE "{role}"')
                    yield connection
        lifecycle=UserLifecycle(UserLifecycleRepository(LimitedDatabase()))
        handle,(_,code)=lifecycle.start('signup','limited@example.com',username='limited-user',password='password123')
        account=lifecycle.verify('signup',handle,code)
        handle,(_,code)=lifecycle.start('unlock',account.email,user=account,session_binding='test-binding')
        token=lifecycle.verify('unlock',handle,code,account,'test-binding')
        updated=lifecycle.update_account(account,handle,token,'test-binding',{'name':'limited-renamed','phone':''})
        assert updated.username=='limited-renamed'
        handle,(_,code)=lifecycle.start('reset',account.email)
        token=lifecycle.verify('reset',handle,code)
        lifecycle.reset_password(handle,token,'password999','password999')
        for sql in ['ALTER TABLE public.users ADD COLUMN forbidden integer',
                    "UPDATE public.users SET status=0", "UPDATE public.users SET document_owner_key='forbidden'",
                    'DELETE FROM public.users']:
            with pytest.raises(Exception):
                lifecycle.repository.transact(lambda cursor: cursor.execute(sql))
    finally:
        db.query(f'DROP OWNED BY "{role}"');db.query(f'DROP ROLE "{role}"')


def test_legacy_password_auth_is_disabled_in_production(monkeypatch):
    from backend.app.auth import require_legacy_password_auth
    from fastapi import HTTPException
    monkeypatch.setenv('NODE_ENV','production');monkeypatch.setenv('PORTAL_LEGACY_PASSWORD_AUTH','true')
    with pytest.raises(HTTPException) as error: require_legacy_password_auth()
    assert error.value.status_code==410
