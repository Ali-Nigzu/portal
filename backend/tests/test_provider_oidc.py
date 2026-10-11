import os
import time
import unittest
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from joserfc import jwt
from joserfc.jwk import RSAKey

from backend.app.services.provider_oidc import ProviderOIDC, ProviderError, ProtectedTickets, callback_uri
from backend.app.services.passwords import verify_password
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.provider_auth import seed_username

ENV = {'PORTAL_SESSION_SECRET':'test-session-secret-for-isolated-auth-tests',
       'PRODUCTION_DOMAIN':'camos.app', 'GOOGLE_CLIENT_ID':'google-test-client',
       'GOOGLE_CLIENT_SECRET':'google-test-secret', 'MICROSOFT_CLIENT_ID':'microsoft-test-client',
       'MICROSOFT_CLIENT_SECRET':'microsoft-test-secret'}
TENANT = '11111111-2222-3333-4444-555555555555'
PERSONAL = '9188040d-6c67-4c5b-b112-36a304b66dad'


class OIDCTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = RSAKey.generate_key(2048, parameters={'kid':'test-key'})
        cls.wrong_key = RSAKey.generate_key(2048, parameters={'kid':'test-key'})

    def setUp(self):
        self.env = patch.dict(os.environ, ENV); self.env.start(); self.addCleanup(self.env.stop)
        self.oidc = ProviderOIDC()
        self.public = self.key.as_dict(private=False)
        self.public['issuer'] = 'https://login.microsoftonline.com/{tenantid}/v2.0'
        self.oidc.keys = lambda provider, **kwargs: [self.public]

    def claims(self, provider='google', **changes):
        now = int(time.time())
        value = dict(iss='https://accounts.google.com', aud=ENV['GOOGLE_CLIENT_ID'], sub='stable-subject',
                     iat=now, exp=now+300, nonce='test-nonce', email='Person@Example.com',
                     email_verified=True, name='John Smith')
        if provider == 'microsoft':
            value.update(iss=f'https://login.microsoftonline.com/{TENANT}/v2.0', tid=TENANT,
                         aud=ENV['MICROSOFT_CLIENT_ID'])
        value.update(changes)
        return value

    def encoded(self, claims, key=None):
        return jwt.encode({'alg':'RS256','kid':'test-key'}, claims, key or self.key)

    def validate(self, provider='google', **changes):
        return self.oidc.validate(provider,self.encoded(self.claims(provider,**changes)),{'nonce':'test-nonce'})

    def test_google_identity_and_issuer_normalization(self):
        identity = self.validate(iss='accounts.google.com')
        self.assertEqual(identity.issuer,'https://accounts.google.com'); self.assertTrue(identity.email_verified)

    def test_microsoft_organizational_and_personal(self):
        for tenant in (TENANT, PERSONAL):
            with self.subTest(tenant=tenant):
                identity=self.validate('microsoft',tid=tenant,iss=f'https://login.microsoftonline.com/{tenant}/v2.0')
                self.assertFalse(identity.email_verified)

    def test_invalid_claims(self):
        for changes in ({'iss':'https://evil.test'}, {'aud':'wrong'}, {'nonce':'wrong'},
                        {'exp':int(time.time())-100}, {'iat':int(time.time())+100}, {'sub':''},
                        {'azp':'wrong'}, {'aud':['google-test-client','other'],'azp':'wrong'}):
            with self.subTest(changes=changes), self.assertRaises(ProviderError): self.validate(**changes)

    def test_missing_essential_claims(self):
        for name in ('iss','aud','sub','exp','iat','nonce'):
            value=self.claims(); value.pop(name)
            with self.subTest(name=name), self.assertRaises(ProviderError):
                self.oidc.validate('google',self.encoded(value),{'nonce':'test-nonce'})

    def test_wrong_signature(self):
        with self.assertRaises(ProviderError):
            self.oidc.validate('google',self.encoded(self.claims(),self.wrong_key),{'nonce':'test-nonce'})

    def test_microsoft_tenant_and_key_issuer(self):
        for changes in ({'tid':'not-a-guid'}, {'tid':PERSONAL}, {'iss':'https://evil.test/'+TENANT}):
            with self.subTest(changes=changes), self.assertRaises(ProviderError): self.validate('microsoft',**changes)
        self.public['issuer']='https://login.microsoftonline.com/'+PERSONAL+'/v2.0'
        with self.assertRaises(ProviderError): self.validate('microsoft')

    def test_start_pkce_state_nonce_exact_callback(self):
        url,ticket=self.oidc.start('google','signup'); query=parse_qs(urlsplit(url).query)
        transaction=self.oidc.transaction('google',ticket,query['state'][0])
        self.assertEqual(query['code_challenge_method'],['S256'])
        self.assertEqual(query['nonce'],[transaction['nonce']])
        self.assertEqual(query['redirect_uri'],['https://camos.app/api/auth/google/callback'])
        self.assertEqual(transaction['intent'],'signup')
        self.assertNotIn('test-secret',url)

    def test_transaction_mismatch_missing_tampering_expiry(self):
        _,ticket=self.oidc.start('google','login')
        transaction=self.oidc.tickets.open('transaction',ticket,600)
        for provider,value,state in [('microsoft',ticket,transaction['state']),('google','',transaction['state']),
                                     ('google',ticket,'wrong'),('google',ticket[:-8]+'tampered',transaction['state'])]:
            with self.subTest(provider=provider,value=value[:8]), self.assertRaises(ProviderError):
                self.oidc.transaction(provider,value,state)
        expired=self.oidc.tickets.seal('transaction',transaction,-1)
        with self.assertRaises(ProviderError): self.oidc.transaction('google',expired,transaction['state'])

    def test_ticket_purpose_separation(self):
        ticket=ProtectedTickets().seal('link',{'identity':'private'},300)
        self.assertNotIn('private',ticket)
        with self.assertRaises(ProviderError): ProtectedTickets().open('transaction',ticket,600)

    def test_callback_hostname_semantics(self):
        self.assertEqual(callback_uri('google'),'https://camos.app/api/auth/google/callback')
        for domain in ('https://camos.app','evil.test/path','user@evil.test','evil.test:443','evil.test?x=1'):
            with patch.dict(os.environ,{'PRODUCTION_DOMAIN':domain}), self.subTest(domain=domain), self.assertRaises(ProviderError): callback_uri('google')

    def test_missing_config(self):
        with patch.dict(os.environ,{'GOOGLE_CLIENT_SECRET':''}), self.assertRaises(ProviderError): self.oidc.start('google','login')

    def test_null_hash_preserved_and_not_verified(self):
        user=CanonicalAuthRepository._user((1,'a@b.com','John',None,None,1,0))
        self.assertIsNone(user.password_hash)
        with patch('backend.app.services.passwords.hasher') as hasher:
            self.assertFalse(verify_password('password',None)); hasher.verify.assert_not_called()
        self.assertFalse(verify_password('password','malformed'))

    def test_username_seed(self):
        self.assertEqual(seed_username(' John Smith\n','john@example.com'),'John Smith')
        self.assertEqual(seed_username('', 'john.smith@example.com'),'john.smith')
        self.assertEqual(len(seed_username('x'*200,'x@example.com')),120)

    def test_code_exchange_uses_pkce_timeout_and_fixed_endpoint(self):
        token=self.encoded(self.claims())
        with patch('backend.app.services.provider_oidc.OAuth2Session.fetch_token',return_value={'id_token':token}) as fetch:
            identity=self.oidc.exchange('google','single-use-code',{'nonce':'test-nonce','verifier':'bound-verifier'})
        self.assertEqual(identity.subject,'stable-subject')
        self.assertEqual(fetch.call_args.args[0],'https://oauth2.googleapis.com/token')
        self.assertEqual(fetch.call_args.kwargs['code_verifier'],'bound-verifier')
        self.assertEqual(fetch.call_args.kwargs['timeout'],(3,10))
        self.assertFalse(fetch.call_args.kwargs['allow_redirects'])

    def test_invalid_tokens_cannot_force_unbounded_key_refresh(self):
        oidc=ProviderOIDC()
        with patch('backend.app.services.provider_oidc.requests.get') as get:
            get.return_value.content=b'keys'; get.return_value.json.return_value={'keys':[self.public]}
            oidc.keys('google')
            for _ in range(4): oidc.keys('google',refresh=True)
            self.assertEqual(get.call_count,1)
