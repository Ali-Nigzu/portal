import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.tests.support import TestDatabase, application, client
from backend.tests.test_provider_oidc import ENV
from backend.app.services import passwords
from backend.app.services.provider_oidc import ProviderIdentity
from backend.app.services.user_lifecycle import SIGNUP, RESET, UNLOCK
from backend.app.services.user_lifecycle_repository import LifecycleError
from backend.app.services.session_tokens import create_session, verify_session_claims
from backend.app.services.organisation_membership_repository import OrganisationMembershipRepository
from backend.app.services.admin_registry import TABLES


@unittest.skipUnless(os.environ.get('CAMOS_TEST_POSTGRES_PORT'), 'Disposable localhost PostgreSQL not configured')
class LifecycleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database=TestDatabase(); cls.database.setup(); cls.hash=passwords.hash_password('correct-password')

    def setUp(self):
        self.env=patch.dict(os.environ,ENV); self.env.start(); self.addCleanup(self.env.stop)
        self.database.reset(); self.app=application(self.database); self.client=client(self.app)
        self.lifecycle=self.app.state.user_lifecycle
        self.mail=patch.object(self.lifecycle,'deliver'); self.delivery=self.mail.start(); self.addCleanup(self.mail.stop)

    def login(self,email='person@example.com',password='correct-password'):
        return self.client.post('/api/login',json={'email':email,'password':password})

    def authenticate(self,user):
        token,_=create_session(user.id,session_version=user.session_version)
        self.client.cookies.set('camos_session',token,domain='camos.app',path='/')
        return token

    def provider_user(self):
        identity=ProviderIdentity('google','https://accounts.google.com','google-sub','person@example.com','John Smith',True)
        return self.app.state.provider_auth.resolve(identity,'signup').user

    def test_email_login_dto_and_me(self):
        self.database.add_user(password_hash=self.hash)
        response=self.login('PERSON@EXAMPLE.COM'); self.assertEqual(response.status_code,200)
        self.assertTrue(response.json()['user']['has_password']); self.assertNotIn('password_hash',response.text)
        self.assertEqual(self.client.get('/api/me').status_code,200)

    def test_legacy_login_shapes_rejected_and_redacted(self):
        self.database.add_user(password_hash=self.hash)
        for payload in ({'username':'John Smith','password':'secret-input'}, {'identifier':'person@example.com','password':'secret-input'},
                        {'email':'person@example.com','username':'John Smith','password':'secret-input'}):
            response=self.client.post('/api/login',json=payload)
            self.assertEqual(response.status_code,422); self.assertNotIn('secret-input',response.text)
        self.assertEqual(self.login('John Smith').status_code,401)

    def test_first_party_duplicate_names_and_cross_column(self):
        self.database.add_user(email='first@example.com',name='second@example.com',password_hash=self.hash)
        handle,delivery=self.lifecycle.start(SIGNUP,'second@example.com',username='second@example.com',password='new-password')
        user=self.lifecycle.verify(SIGNUP,handle,delivery[1]); self.assertIsNotNone(user.password_hash)
        self.assertEqual(user.username,'second@example.com')
        with self.assertRaises(LifecycleError): self.lifecycle.verify(SIGNUP,handle,delivery[1])
        with self.assertRaises(LifecycleError): self.lifecycle.start(SIGNUP,'SECOND@EXAMPLE.COM',username='Other',password='new-password')

    def test_signup_api_retains_completion(self):
        with patch('backend.app.services.postmark_email.send_admin_signup_notification'):
            response=self.client.post('/api/signup/start',json={'email':'new@example.com','name':'John Smith','password':'new-password'})
            self.assertEqual(response.status_code,202)
            code=self.delivery.call_args.args[2]
            response=self.client.post('/api/signup/verify',json={'email':'new@example.com','code':code})
            self.assertEqual(response.status_code,201); self.assertTrue(response.json()['user']['has_password'])
            self.assertNotIn('camos_session',self.client.cookies)

    def test_provider_required_login_skips_argon(self):
        self.provider_user()
        with patch('backend.app.services.passwords.verify_password') as verify:
            response=self.login(); verify.assert_not_called()
        self.assertEqual(response.status_code,409); self.assertEqual(response.json()['providers'],['google'])

    def test_provider_required_reset_no_authority_or_email(self):
        self.provider_user(); self.client.cookies.set('camos_reset_challenge','old')
        response=self.client.post('/api/password-reset/start',json={'email':'person@example.com'})
        self.assertEqual(response.status_code,409); self.assertEqual(response.json()['error'],'provider_required')
        self.delivery.assert_not_called()
        self.assertIn('Max-Age=0',response.headers['set-cookie'])
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_lifecycle_challenges')[0][0],0)

    def test_reset_email_only(self):
        self.database.add_user(password_hash=self.hash)
        self.assertEqual(self.client.post('/api/password-reset/start',json={'identifier':'person@example.com'}).status_code,422)
        self.assertEqual(self.client.post('/api/password-reset/start',json={'email':'John Smith'}).status_code,422)

    def test_normal_reset_version_and_replay(self):
        user=self.database.add_user(password_hash=self.hash)
        handle,delivery=self.lifecycle.start(RESET,user.email)
        self.lifecycle.verify(RESET,handle,delivery[1]); self.lifecycle.reset_password(handle,'next-password','next-password')
        updated=self.app.state.auth_repository.get_enabled_user(user.id)
        self.assertEqual(updated.session_version,1); self.assertTrue(passwords.verify_password('next-password',updated.password_hash))
        with self.assertRaises(LifecycleError): self.lifecycle.reset_password(handle,'next-password','next-password')

    def test_stale_reset_cannot_create_first_password(self):
        user=self.database.add_user(password_hash=self.hash)
        handle,delivery=self.lifecycle.start(RESET,user.email)
        self.database.execute('UPDATE users SET password_hash=NULL WHERE id=%s',(user.id,))
        for operation in (lambda:self.lifecycle.resend(RESET,handle),lambda:self.lifecycle.verify(RESET,handle,delivery[1]),
                          lambda:self.lifecycle.reset_password(handle,'first-password','first-password')):
            with self.assertRaises(LifecycleError): operation()
        self.assertIsNone(self.app.state.auth_repository.get_enabled_user(user.id).password_hash)

    def test_reset_attempts_resends_expiry_and_cooldown(self):
        user=self.database.add_user(password_hash=self.hash); handle,delivery=self.lifecycle.start(RESET,user.email)
        with self.assertRaises(LifecycleError) as error: self.lifecycle.resend(RESET,handle)
        self.assertEqual(error.exception.status,429)
        for _ in range(5):
            with self.assertRaises(LifecycleError): self.lifecycle.verify(RESET,handle,'not-a-code')
        with self.assertRaises(LifecycleError) as error: self.lifecycle.verify(RESET,handle,delivery[1])
        self.assertEqual(error.exception.status,429)
        handle,delivery=self.lifecycle.start(RESET,user.email)
        self.database.execute("UPDATE user_lifecycle_challenges SET code_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second'")
        with self.assertRaises(LifecycleError) as error: self.lifecycle.verify(RESET,handle,delivery[1])
        self.assertEqual(error.exception.status,410)
        self.database.execute('DELETE FROM user_lifecycle_challenges')
        handle,_=self.lifecycle.start(RESET,user.email)
        for _ in range(5):
            self.database.execute("UPDATE user_lifecycle_challenges SET last_sent_at=CURRENT_TIMESTAMP-INTERVAL '31 seconds'")
            self.lifecycle.resend(RESET,handle)
        self.database.execute("UPDATE user_lifecycle_challenges SET last_sent_at=CURRENT_TIMESTAMP-INTERVAL '31 seconds'")
        with self.assertRaises(LifecycleError) as error: self.lifecycle.resend(RESET,handle)
        self.assertEqual(error.exception.status,429)

    def test_passwordless_unlock_first_password_and_old_session(self):
        user=self.provider_user(); old=self.authenticate(user)
        response=self.client.post('/api/settings/unlock/start',json={}); self.assertEqual(response.status_code,200)
        code=self.delivery.call_args.args[2]
        response=self.client.post('/api/settings/unlock/verify',json={'code':code}); self.assertEqual(response.status_code,200)
        token=response.json()['unlockToken']
        response=self.client.put('/api/me',json={'password':'first-password','confirm_password':'first-password','unlock_token':token})
        self.assertEqual(response.status_code,200); self.assertTrue(response.json()['user']['has_password'])
        current=self.client.cookies.get('camos_session'); self.assertEqual(verify_session_claims(current)[1],1)
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0],1)
        self.assertEqual(self.client.get('/api/me',headers={'Cookie':'camos_session='+old}).status_code,401)
        self.assertEqual(self.login(password='first-password').status_code,200)

    def test_password_user_unlock_still_requires_password(self):
        user=self.database.add_user(password_hash=self.hash); self.authenticate(user)
        self.assertEqual(self.client.post('/api/settings/unlock/start',json={}).status_code,401)
        self.assertEqual(self.client.post('/api/settings/unlock/start',json={'current_password':'wrong'}).status_code,401)
        self.delivery.assert_not_called()
        self.assertEqual(self.client.post('/api/settings/unlock/start',json={'current_password':'correct-password'}).status_code,200)

    def test_profile_edit_duplicate_allowed(self):
        self.database.add_user(email='other@example.com',password_hash=self.hash)
        user=self.database.add_user(email='person@example.com',name='Other',password_hash=self.hash)
        handle,delivery=self.lifecycle.start(UNLOCK,user.email,user=user); self.lifecycle.verify(UNLOCK,handle,delivery[1],user)
        updated=self.lifecycle.update_account(user,handle,{'name':'John Smith'})
        self.assertEqual(updated.username,'John Smith')

    def test_admin_and_disabled_login(self):
        self.database.add_user(password_hash=self.hash,user_id=999999)
        self.assertEqual(self.login().status_code,401)
        self.database.reset(); self.database.add_user(password_hash=self.hash,status=0)
        self.assertEqual(self.login().status_code,401)

    def test_admin_lookup_and_nullable_registry(self):
        self.database.add_user(email='customer@example.com',name='Admin',password_hash=self.hash)
        admin=self.database.add_user(name='Admin',password_hash=self.hash,user_id=999999)
        self.assertEqual(self.app.state.auth_repository.find_username('Admin').id,admin.id)
        self.assertTrue(TABLES['users'].fields['password_hash'].nullable)

    def test_invitation_lookup_zero_one_many(self):
        repository=OrganisationMembershipRepository(self.database)
        with self.database.connection() as connection:
            self.assertIsNone(repository.invite_target(connection,'username','John Smith'))
        first=self.database.add_user()
        with self.database.connection() as connection:
            self.assertEqual(repository.invite_target(connection,'username','John Smith')['user_id'],str(first.id))
        self.database.add_user(email='other@example.com')
        with self.database.connection() as connection:
            self.assertEqual(repository.invite_target(connection,'username','John Smith'),{'ambiguous':True})
            self.assertEqual(repository.invite_target(connection,'email','person@example.com')['user_id'],str(first.id))

    def test_ambiguous_invitation_message_and_no_membership_selection(self):
        from backend.app.services.organisation_memberships import OrganisationMemberships,MembershipError
        self.database.add_user(); self.database.add_user(email='other@example.com')
        repository=OrganisationMembershipRepository(self.database)
        service=OrganisationMemberships(repository)
        with patch.object(repository,'lock'), patch.object(service,'_actor'), patch.object(service,'_organisation'), patch.object(service,'_member'), patch.object(repository,'membership') as selected:
            with self.assertRaises(MembershipError) as error:
                service.initiate(123,'1',identifier_type='username',identifier='John Smith')
        self.assertEqual(error.exception.message,"Please use the user's email address.")
        self.assertEqual(error.exception.status,409); selected.assert_not_called()
