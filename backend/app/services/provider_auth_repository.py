"""Immutable stable identity mappings; SELECT/INSERT only on the identity table."""

import json
from contextlib import closing

from .canonical_auth import CanonicalAuthRepository, ReservedCustomerId, USER_COLUMNS
from .provider_oidc import ProviderError, PROVIDERS


class ProviderAuthRepository:
    def __init__(self, database):
        self.database = database

    def transact(self, operation):
        try:
            with self.database.transaction() as connection, closing(connection.cursor()) as cursor:
                return operation(cursor)
        except ProviderError:
            raise
        except ReservedCustomerId:
            raise ProviderError('provider-conflict', 409) from None
        except Exception as error:
            detail = error.args[0] if error.args else None
            if isinstance(detail, dict) and detail.get('C') == '23505':
                raise ProviderError('provider-conflict', 409) from None
            raise

    @staticmethod
    def lock_identity(cursor, identity):
        # JSON avoids ambiguous concatenation; separate hash seed from email locks.
        key = json.dumps(identity, sort_keys=True, separators=(',', ':'))
        cursor.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,1))', (key,))

    @staticmethod
    def lock_email(cursor, email):
        cursor.execute('SELECT pg_advisory_xact_lock(hashtextextended(lower(%s),0))', (email,))

    @staticmethod
    def mapped_user(cursor, identity):
        cursor.execute('SELECT user_id FROM public.user_auth_identities '
            'WHERE provider=%s AND issuer=%s AND subject=%s',
            (identity['provider'], identity['issuer'], identity['subject']))
        row = cursor.fetchone()
        return int(row[0]) if row else None

    @staticmethod
    def user(cursor, user_id):
        cursor.execute(f'SELECT {USER_COLUMNS} FROM public.users WHERE id=%s FOR UPDATE', (user_id,))
        return CanonicalAuthRepository._user(cursor.fetchone())

    @staticmethod
    def user_provider(cursor, user_id, provider):
        cursor.execute('SELECT 1 FROM public.user_auth_identities WHERE user_id=%s AND provider=%s',
                       (user_id, provider))
        return cursor.fetchone() is not None

    @staticmethod
    def insert(cursor, user_id, identity):
        cursor.execute('INSERT INTO public.user_auth_identities(user_id,provider,issuer,subject) '
            'VALUES(%s,%s,%s,%s)', (user_id, identity['provider'], identity['issuer'], identity['subject']))

    @staticmethod
    def create(cursor, email, username, identity):
        user = CanonicalAuthRepository.create_customer(cursor, email, username)
        ProviderAuthRepository.insert(cursor, user.id, identity)
        return user

    def providers(self, user_id):
        with self.database.connection() as connection, closing(connection.cursor()) as cursor:
            cursor.execute('SELECT provider FROM public.user_auth_identities WHERE user_id=%s ORDER BY provider',
                           (user_id,))
            values = {int(row[0]) for row in cursor.fetchall()}
        return [name for name, value in PROVIDERS.items() if value in values]
