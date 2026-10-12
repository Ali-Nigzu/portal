import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from urllib.parse import parse_qs,urlsplit

from backend.tests.support import TestDatabase, application, client
from backend.tests.test_provider_oidc import ENV, TENANT
from backend.app.services import passwords
from backend.app.services.provider_oidc import ProviderIdentity,ProviderError
from backend.app.services.provider_auth_repository import ProviderAuthRepository
from backend.app.services.user_lifecycle_repository import LifecycleError


@unittest.skipUnless(os.environ.get('CAMOS_TEST_POSTGRES_PORT'), 'Disposable localhost PostgreSQL not configured')
class ProviderAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database=TestDatabase(); cls.database.setup(); cls.hash=passwords.hash_password('correct-password')

    def setUp(self):
        self.env=patch.dict(os.environ,ENV); self.env.start(); self.addCleanup(self.env.stop)
        self.database.reset(); self.app=application(self.database); self.client=client(self.app)
        self.auth=self.app.state.provider_auth; self.lifecycle=self.app.state.user_lifecycle
        self.google=ProviderIdentity('google','https://accounts.google.com','google-sub','person@example.com','John Smith',True)
        self.microsoft=ProviderIdentity('microsoft',f'https://login.microsoftonline.com/{TENANT}/v2.0','ms-sub','person@example.com','John Smith')

    def begin_callback(self,identity,intent='signup',error=None):
        response=self.client.post(f'/api/auth/{identity.provider}/start',json={'intent':intent})
        self.assertEqual(response.status_code,200)
        state=parse_qs(urlsplit(response.json()['authorization_url']).query)['state'][0]
        with patch.object(self.auth.oidc,'exchange',return_value=identity):
            return self.client.get(f'/api/auth/{identity.provider}/callback',params={'state':state,**({'error':error} if error else {'code':'test-code'})},follow_redirects=False)

    def test_google_signup_atomic_and_known_login_preserves_profile(self):
        decision=self.auth.resolve(self.google,'signup'); self.assertEqual(decision.kind,'session')
        self.assertIsNone(decision.user.password_hash); self.assertIsNone(decision.user.phone_number)
        changed=ProviderIdentity('google',self.google.issuer,self.google.subject,'changed@example.com','Changed Name',False)
        known=self.auth.resolve(changed,'login').user
        self.assertEqual(known.id,decision.user.id); self.assertEqual(known.email,'person@example.com'); self.assertEqual(known.username,'JohnSmith')

    def test_unknown_login_never_creates(self):
        for identity in (self.google,self.microsoft): self.assertEqual(self.auth.resolve(identity,'login').kind,'signup-required')
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],0)

    def test_google_requires_verified_email_and_usable_mail(self):
        for identity in (ProviderIdentity('google',self.google.issuer,'new',self.google.email,'Name',False),
                         ProviderIdentity('google',self.google.issuer,'new','invalid','Name',True)):
            with self.assertRaises(ProviderError): self.auth.resolve(identity,'signup')

    def test_microsoft_signup_verifies_mail_before_atomic_creation(self):
        with patch.object(self.lifecycle,'deliver') as deliver:
            response=self.begin_callback(self.microsoft)
            self.assertIn('verify-provider-email',response.headers['location'])
            self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],0)
            self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],0)
            state=self.client.get('/api/auth/signup'); self.assertEqual(state.json()['email'],'person@example.com')
            self.assertEqual(self.client.post('/api/auth/signup/verify',json={'code':'wrong'}).status_code,400)
            code=deliver.call_args.args[2]
            response=self.client.post('/api/auth/signup/verify',json={'code':code})
            self.assertEqual(response.status_code,200); self.assertFalse(response.json()['user']['has_password'])
            self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],1)
            self.assertEqual(self.client.post('/api/auth/signup/verify',json={'code':code}).status_code,400)
        self.assertEqual(self.auth.resolve(self.microsoft,'login').kind,'session')

    def test_microsoft_mail_failure_preserves_resend_authority(self):
        with patch.object(self.lifecycle,'deliver',side_effect=RuntimeError('sensitive-mail-error')):
            response=self.begin_callback(self.microsoft)
            self.assertIn('mail=unavailable',response.headers['location'])
            self.assertEqual(self.client.get('/api/auth/signup').status_code,200)
            self.assertNotIn('sensitive',response.headers['location'])

    def test_provider_signup_authority_not_interchangeable(self):
        handle,delivery=self.lifecycle.start(0,'new@example.com',username='Name',password='new-password')
        self.client.cookies.set('camos_provider_signup',handle)
        self.assertEqual(self.client.get('/api/auth/signup').status_code,410)
        self.assertEqual(self.client.post('/api/auth/signup/verify',json={'code':delivery[1]}).status_code,410)

    def test_existing_password_link_both_providers_and_replay(self):
        self.database.add_user(password_hash=self.hash)
        for identity in (self.google,self.microsoft):
            response=self.begin_callback(identity,intent='login'); self.assertIn('confirm-provider',response.headers['location'])
            self.assertEqual(self.client.get('/api/auth/link').json()['provider'],identity.provider)
            self.assertEqual(self.client.post('/api/auth/link',json={'password':'wrong'}).status_code,401)
            self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],0 if identity.provider=='google' else 1)
            ticket=self.client.cookies.get('camos_provider_link')
            response=self.client.post('/api/auth/link',json={'password':'correct-password'}); self.assertEqual(response.status_code,200)
            self.client.cookies.set('camos_provider_link',ticket,domain='camos.app',path='/api/auth')
            self.assertEqual(self.client.post('/api/auth/link',json={'password':'correct-password'}).status_code,409)

    def test_link_stale_version_or_hash(self):
        user=self.database.add_user(password_hash=self.hash)
        self.begin_callback(self.google)
        self.database.execute('UPDATE users SET session_version=session_version+1 WHERE id=%s',(user.id,))
        self.assertEqual(self.client.post('/api/auth/link',json={'password':'correct-password'}).status_code,410)
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],0)

    def test_passwordless_existing_email_no_second_provider_link(self):
        self.auth.resolve(self.google,'signup')
        response=self.begin_callback(self.microsoft)
        self.assertEqual(response.headers['location'],'/login?auth=provider-required')
        self.assertEqual(self.client.get('/api/auth/result').json()['providers'],['google'])
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],1)

    def test_disabled_admin_mapping_and_email_boundaries(self):
        for user_id,status in ((999999,1),(7,0)):
            self.database.reset(); self.database.add_user(user_id=user_id,status=status,password_hash=self.hash)
            with self.assertRaises(ProviderError): self.auth.resolve(self.google,'signup')
            self.database.execute('INSERT INTO user_auth_identities(user_id,provider,issuer,subject) VALUES(%s,0,%s,%s)',
                (user_id,self.google.issuer,self.google.subject))
            with self.assertRaises(ProviderError): self.auth.resolve(self.google,'login')

    def test_identity_not_retargeted_by_email(self):
        first=self.auth.resolve(self.google,'signup').user
        other=self.database.add_user(email='other@example.com',password_hash=self.hash)
        changed=ProviderIdentity('google',self.google.issuer,self.google.subject,other.email,'Other',True)
        self.assertEqual(self.auth.resolve(changed,'login').user.id,first.id)

    def test_same_provider_identity_replacement_rejected(self):
        user=self.database.add_user(password_hash=self.hash)
        self.database.execute('INSERT INTO user_auth_identities(user_id,provider,issuer,subject) VALUES(%s,0,%s,%s)',(user.id,self.google.issuer,'different'))
        with self.assertRaises(ProviderError): self.auth.resolve(self.google,'signup')

    def test_callback_cancel_invalid_state_and_duplicate(self):
        response=self.begin_callback(self.google,error='access_denied')
        self.assertEqual(response.headers['location'],'/create-account?auth=provider-cancelled')
        response=self.client.get('/api/auth/google/callback?state=wrong&code=private-code',follow_redirects=False)
        self.assertIn('provider-expired',response.headers['location']); self.assertNotIn('private-code',response.headers['location'])
        self.assertNotIn('code',response.headers.get('location',''))
        self.assertEqual(response.headers['referrer-policy'],'no-referrer')

    def test_missing_config_unknown_provider_origin_and_host(self):
        with patch.dict(os.environ,{'GOOGLE_CLIENT_SECRET':''}):
            self.assertEqual(self.client.post('/api/auth/google/start',json={'intent':'login'}).status_code,503)
        self.assertEqual(self.client.post('/api/auth/evil/start',json={'intent':'login'}).status_code,422)
        response=self.client.post('/api/auth/google/start',json={'intent':'login'},headers={'Origin':'https://evil.test'})
        self.assertEqual(response.status_code,403)
        response=self.client.post('/api/auth/google/start',json={'intent':'login'},headers={'Host':'evil.test','X-Forwarded-Host':'evil.test'})
        self.assertEqual(parse_qs(urlsplit(response.json()['authorization_url']).query)['redirect_uri'],['https://camos.app/api/auth/google/callback'])
        response=self.client.post('/api/auth/google/start',json={'intent':'login','return_to':'https://evil.test'})
        self.assertEqual(response.status_code,422)

    def test_concurrent_same_identity_and_email(self):
        with ThreadPoolExecutor(max_workers=4) as executor:
            values=list(executor.map(lambda _:self.auth.resolve(self.google,'signup').user.id,range(4)))
        self.assertEqual(len(set(values)),1)
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],1)
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],1)

    def test_mapping_failure_rolls_back_user(self):
        with patch.object(ProviderAuthRepository,'insert',side_effect=RuntimeError('insertion failed')):
            with self.assertRaises(RuntimeError): self.auth.resolve(self.google,'signup')
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],0)

    def test_microsoft_mapping_failure_rolls_back_verified_signup(self):
        with patch.object(self.lifecycle,'deliver') as deliver:
            self.begin_callback(self.microsoft); code=deliver.call_args.args[2]
        with patch.object(ProviderAuthRepository,'insert',side_effect=RuntimeError('insertion failed')):
            self.assertEqual(self.client.post('/api/auth/signup/verify',json={'code':code}).status_code,503)
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],0)
        self.assertEqual(self.client.post('/api/auth/signup/verify',json={'code':code}).status_code,200)

    def test_distinct_identity_same_email_race_does_not_auto_link(self):
        other=ProviderIdentity('google',self.google.issuer,'another-subject',self.google.email,'Other',True)
        with ThreadPoolExecutor(max_workers=2) as executor:
            decisions=list(executor.map(lambda identity:self.auth.resolve(identity,'signup'),[self.google,other]))
        self.assertEqual({decision.kind for decision in decisions},{'session','provider-required'})
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],1)
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],1)

    def test_first_party_and_google_creation_race(self):
        handle,delivery=self.lifecycle.start(0,self.google.email,username='JohnSmith',password='new-password')
        def attempt(action):
            try: return action()
            except (LifecycleError,ProviderError): return None
        with ThreadPoolExecutor(max_workers=2) as executor:
            tasks=[executor.submit(attempt,lambda:self.lifecycle.verify(0,handle,delivery[1])),
                   executor.submit(attempt,lambda:self.auth.resolve(self.google,'signup'))]
            for task in tasks: task.result(timeout=10)
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],1)
        self.assertLessEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],1)

    def test_expired_link_and_disabled_pending_link(self):
        user=self.database.add_user(password_hash=self.hash)
        self.begin_callback(self.google)
        ticket=self.auth.oidc.tickets.open('link',self.client.cookies.get('camos_provider_link'),300)
        expired=self.auth.oidc.tickets.seal('link',ticket,-1)
        self.client.cookies.set('camos_provider_link',expired,domain='camos.app',path='/api/auth')
        self.assertEqual(self.client.post('/api/auth/link',json={'password':'correct-password'}).status_code,410)
        self.begin_callback(self.google)
        self.database.execute('UPDATE users SET status=0 WHERE id=%s',(user.id,))
        self.assertEqual(self.client.post('/api/auth/link',json={'password':'correct-password'}).status_code,403)
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],0)

    def test_microsoft_two_verifications_one_account(self):
        mapping=self.microsoft.mapping()
        one,delivery_one=self.lifecycle.start(0,self.microsoft.email,username='John',provider_identity=mapping)
        two,delivery_two=self.lifecycle.start(0,self.microsoft.email,username='John',provider_identity=mapping)
        def verify(value):
            try: return self.lifecycle.verify(0,value[0],value[1],provider_signup=True)
            except LifecycleError: return None
        with ThreadPoolExecutor(max_workers=2) as executor:
            values=list(executor.map(verify,[(one,delivery_one[1]),(two,delivery_two[1])]))
        self.assertEqual(sum(value is not None for value in values),1)
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],1)
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],1)

    def test_invalid_callback_never_exchanges_and_duplicate_parameters_rejected(self):
        with patch.object(self.auth.oidc,'exchange') as exchange:
            response=self.client.get('/api/auth/google/callback?state=wrong&code=private',follow_redirects=False)
            exchange.assert_not_called(); self.assertIn('provider-expired',response.headers['location'])
            response=self.client.get('/api/auth/google/callback?state=a&state=b&code=private',follow_redirects=False)
            exchange.assert_not_called(); self.assertIn('provider-expired',response.headers['location'])

    def test_google_callback_signed_token_exchange_and_replay(self):
        from joserfc import jwt
        import time
        response=self.client.post('/api/auth/google/start',json={'intent':'signup'})
        transaction_cookie=self.client.cookies.get('camos_oidc_transaction')
        transaction=self.auth.oidc.tickets.open('transaction',transaction_cookie,600)
        from joserfc.jwk import RSAKey
        key=RSAKey.generate_key(2048,parameters={'kid':'test-key'})
        self.auth.oidc.keys=lambda provider,**kwargs:[key.as_dict(private=False)]
        claims={'iss':self.google.issuer,'aud':ENV['GOOGLE_CLIENT_ID'],'sub':self.google.subject,
                'iat':int(time.time()),'exp':int(time.time())+300,'nonce':transaction['nonce'],
                'email':self.google.email,'email_verified':True,'name':'John Smith'}
        token=jwt.encode({'alg':'RS256','kid':'test-key'},claims,key)
        with patch('backend.app.services.provider_oidc.OAuth2Session.fetch_token',side_effect=[{'id_token':token},RuntimeError('already used')]) as fetch:
            response=self.client.get('/api/auth/google/callback',params={'state':transaction['state'],'code':'single-use-code'},follow_redirects=False)
            self.assertEqual(response.headers['location'],'/home')
            self.assertEqual(fetch.call_args.kwargs['code_verifier'],transaction['verifier'])
            self.client.cookies.set('camos_oidc_transaction',transaction_cookie,domain='camos.app',path='/api/auth')
            response=self.client.get('/api/auth/google/callback',params={'state':transaction['state'],'code':'single-use-code'},follow_redirects=False)
            self.assertIn('provider-error',response.headers['location'])
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0],1)

    def test_no_sensitive_callback_logging(self):
        response=self.client.post('/api/auth/google/start',json={'intent':'signup'})
        state=parse_qs(urlsplit(response.json()['authorization_url']).query)['state'][0]
        with patch.object(self.auth.oidc,'exchange',side_effect=RuntimeError('private-token-and-secret')):
            with self.assertLogs('backend.app.api.provider_auth',level='WARNING') as logs:
                response=self.client.get('/api/auth/google/callback',params={'state':state,'code':'private-code'},follow_redirects=False)
        self.assertNotIn('private-token-and-secret',' '.join(logs.output)+response.headers['location'])
