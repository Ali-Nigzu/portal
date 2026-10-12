"""Canonical insertion, profile policy and shared abuse-budget regressions."""

import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.tests.support import TestDatabase, application, client
from backend.tests.test_provider_oidc import ENV, TENANT
from backend.app.api import admin
from backend.app.services.admin_repository import AdminRepository
from backend.app.services.admin_registry import AdminError
from backend.app.services.auth_budgets import consume_budget
from backend.app.services import passwords
from backend.app.services.provider_oidc import ProviderIdentity, ProviderError
from backend.app.services.user_lifecycle import SIGNUP, RESET, UNLOCK, digest
from backend.app.services.user_lifecycle_repository import LifecycleError
from backend.app.services.user_policy import username_value, seed_username, InvalidUsername


class UsernamePolicyTests(unittest.TestCase):
    def test_manual_boundaries_and_character_allowance(self):
        for value in ('abc', '123', 'MiXeD', 'a.b', '名字🙂', '🙂' * 15, 'x' * 15, 'a\x7fb'):
            with self.subTest(value=value):
                self.assertEqual(username_value(value), value)
        for value in ('ab', 'x' * 16, ' John', 'John ', 'Jo hn', 'a\u00a0b', 'a\u0085b', 'a\u2003b', 'a\tb', 'a\x00b', 'a\ud800b'):
            with self.subTest(value=repr(value)), self.assertRaises(InvalidUsername):
                username_value(value)

    def test_provider_seed_is_deterministic_nonunique_and_unicode_safe(self):
        self.assertEqual(seed_username(' John\u00a0Smith\n', 'john@example.invalid'), 'JohnSmith')
        self.assertEqual(seed_username('🙂' * 20, 'x@example.invalid'), '🙂' * 15)
        self.assertEqual(seed_username('Al', 'alex@example.invalid'), 'alex')
        self.assertEqual(seed_username('A', 'a@example.invalid'), 'user')
        self.assertEqual(seed_username('\x00\x7f', 'a@example.invalid'), 'user')
        self.assertEqual(seed_username('Same', 'one@example.invalid'), seed_username('Same', 'two@example.invalid'))


@unittest.skipUnless(os.environ.get('CAMOS_TEST_POSTGRES_PORT'), 'Disposable localhost PostgreSQL not configured')
class ProductionAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = TestDatabase(); cls.database.setup()
        cls.password_hash = passwords.hash_password('correct-password')

    def setUp(self):
        environment = patch.dict(os.environ, ENV); environment.start(); self.addCleanup(environment.stop)
        self.database.reset()
        self.app = application(self.database); self.app.include_router(admin.router)
        self.client = client(self.app); self.lifecycle = self.app.state.user_lifecycle

    def boundary(self):
        self.database.execute("SELECT setval(pg_get_serial_sequence('public.users','id'),999998,true)")

    def test_first_party_reserved_allocation_rolls_back_and_can_retry(self):
        self.boundary()
        handle, delivery = self.lifecycle.start(SIGNUP, 'new@example.invalid', username='Ordinary', password='correct-password')
        with self.assertRaises(LifecycleError):
            self.lifecycle.verify(SIGNUP, handle, delivery[1])
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0], 0)
        self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0], 0)
        row = self.database.execute('SELECT consumed_at FROM user_lifecycle_challenges WHERE id=%s', (digest(handle),))
        self.assertEqual(len(row), 1); self.assertIsNone(row[0][0])
        self.assertEqual(self.client.post('/api/admin/login', json={'username': 'Ordinary', 'password': 'correct-password'}).status_code, 401)
        self.assertEqual(self.lifecycle.verify(SIGNUP, handle, delivery[1]).id, 1000000)

    def test_provider_sequence_boundaries_leave_no_orphans(self):
        for provider in ('google', 'microsoft'):
            with self.subTest(provider=provider):
                self.database.reset(); self.boundary()
                identity = ProviderIdentity(provider, 'https://accounts.google.com' if provider == 'google'
                    else f'https://login.microsoftonline.com/{TENANT}/v2.0', 'subject', 'new@example.invalid', 'New Person', True)
                if provider == 'google':
                    with self.assertRaises(ProviderError): self.app.state.provider_auth.resolve(identity, 'signup')
                else:
                    handle, delivery = self.lifecycle.start(SIGNUP, identity.email, username='NewPerson', provider_identity=identity.mapping())
                    with self.assertRaises(LifecycleError): self.lifecycle.verify(SIGNUP, handle, delivery[1], provider_signup=True)
                    pending = self.database.execute('SELECT consumed_at FROM user_lifecycle_challenges WHERE id=%s', (digest(handle),))
                    self.assertEqual(len(pending), 1); self.assertIsNone(pending[0][0])
                self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0], 0)
                self.assertEqual(self.database.execute('SELECT count(*) FROM user_auth_identities')[0][0], 0)

    def test_existing_admin_is_preserved_and_stays_separate(self):
        admin_user = self.database.add_user(name='Legacy Admin', user_id=999999, password_hash=self.password_hash)
        response = self.client.post('/api/admin/login', json={'username': 'legacy admin', 'password': 'correct-password'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.post('/api/login', json={'email': admin_user.email, 'password': 'correct-password'}).status_code, 401)
        self.assertEqual(self.app.state.auth_repository.find_username('LEGACY ADMIN').id, 999999)

    def unlock(self, user):
        handle, delivery = self.lifecycle.start(UNLOCK, user.email, user=user)
        self.lifecycle.verify(UNLOCK, handle, delivery[1], user=user)
        return handle

    def test_grandfathered_name_allows_unrelated_and_unchanged_updates(self):
        user = self.database.add_user(name='An Old Name That Exceeds Fifteen', password_hash=self.password_hash)
        handle = self.unlock(user)
        updated = self.lifecycle.update_account(user, handle, {'name': user.username, 'phone': '+447700900123'})
        self.assertEqual(updated.username, user.username)
        self.assertEqual(updated.phone_number, '+447700900123')
        with self.assertRaises(LifecycleError): self.lifecycle.update_account(user, handle, {'name': ' New'})
        self.assertEqual(self.lifecycle.update_account(user, handle, {'name': 'New.Name'}).username, 'New.Name')

    def test_old_pending_names_are_revalidated_or_provider_reseeded(self):
        handle, delivery = self.lifecycle.start(SIGNUP, 'new@example.invalid', username='Valid', password='correct-password')
        payload = self.database.execute('SELECT payload FROM user_lifecycle_challenges WHERE id=%s', (digest(handle),))[0][0]
        payload['username'] = 'Old Invalid Name'
        self.database.execute('UPDATE user_lifecycle_challenges SET payload=%s WHERE id=%s', (json.dumps(payload), digest(handle)))
        with self.assertRaises(LifecycleError): self.lifecycle.verify(SIGNUP, handle, delivery[1])
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0], 0)
        mapping = {'provider': 1, 'issuer': f'https://login.microsoftonline.com/{TENANT}/v2.0', 'subject': 'old-ms'}
        other, mail = self.lifecycle.start(SIGNUP, 'a@example.invalid', username='Valid', provider_identity=mapping)
        payload = self.database.execute('SELECT payload FROM user_lifecycle_challenges WHERE id=%s', (digest(other),))[0][0]
        payload['username'] = 'A'
        self.database.execute('UPDATE user_lifecycle_challenges SET payload=%s WHERE id=%s', (json.dumps(payload), digest(other)))
        self.assertEqual(self.lifecycle.verify(SIGNUP, other, mail[1], provider_signup=True).username, 'user')

    def test_admin_changed_name_policy_and_reserved_create_boundary(self):
        repo = AdminRepository(self.database)
        user = self.database.add_user(name='Legacy Name', password_hash=self.password_hash)
        self.assertEqual(repo.mutate('users', {'username': 'Legacy Name', 'phone_number': None}, {'id': str(user.id)})['username'], 'Legacy Name')
        with self.assertRaises(AdminError): repo.mutate('users', {'username': 'Bad Name'}, {'id': str(user.id)})
        self.assertEqual(repo.mutate('users', {'username': 'Good.Name'}, {'id': str(user.id)})['username'], 'Good.Name')
        self.boundary()
        with self.assertRaises(AdminError): repo.mutate('users', {'email': 'new@example.invalid', 'username': 'Ordinary',
            'password_hash': None, 'phone_number': None, 'status': 1, 'created_at': datetime.now(timezone.utc).isoformat()})
        self.assertIsNone(self.app.state.auth_repository.get_enabled_user(999999))
        self.database.add_user('admin@example.invalid','Admin Old',user_id=999999)
        self.assertEqual(repo.mutate('users',{'username':'AB'},{'id':'999999'})['username'],'AB')

    def test_start_budget_shared_across_service_instances_and_purposes(self):
        user = self.database.add_user(password_hash=self.password_hash)
        for _ in range(5): self.assertIsNotNone(self.lifecycle.start(RESET, user.email)[1])
        other = application(self.database).state.user_lifecycle
        self.assertIsNone(other.start(RESET, user.email)[1])
        self.assertIsNotNone(other.start(UNLOCK, user.email, user=user)[1])
        different = self.database.add_user(email='different@example.invalid', password_hash=self.password_hash)
        self.assertIsNotNone(other.start(RESET, different.email)[1])
        other.clock = lambda: datetime.now(timezone.utc) + timedelta(hours=2)
        self.assertIsNotNone(other.start(RESET, user.email)[1])

    def test_concurrent_budget_reservation_is_atomic_and_not_credential_authority(self):
        def attempt(_):
            with self.database.transaction() as connection:
                cursor = connection.cursor()
                try: return consume_budget(cursor, SIGNUP, 'quota@example.invalid', datetime.now(timezone.utc))
                finally: cursor.close()
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(attempt, range(16))), 5)
        budget_id = self.database.execute("SELECT id FROM user_lifecycle_challenges WHERE id LIKE 'budget:%'")[0][0]
        with self.assertRaises(LifecycleError): self.lifecycle.verify(SIGNUP, budget_id, '000000')
        self.assertEqual(self.database.execute('SELECT count(*) FROM users')[0][0], 0)

    def test_login_budget_has_same_response_for_existing_and_unknown_accounts(self):
        user = self.database.add_user(password_hash=self.password_hash)
        with patch('backend.app.services.passwords.verify_password', return_value=False):
            for email in (user.email, 'unknown@example.invalid'):
                for _ in range(30):
                    self.assertEqual(self.client.post('/api/login', json={'email': email, 'password': 'incorrect'}).status_code, 401)
                self.assertEqual(self.client.post('/api/login', json={'email': email, 'password': 'incorrect'}).status_code, 429)
