"""Parameterized canonical identity and challenge operations on one transaction."""

import json
from contextlib import closing

from .canonical_auth import CanonicalAuthRepository

USER_COLUMNS = (
    "id, email, username, phone_number, password_hash, status, "
    "session_version"
)
CHALLENGE_COLUMNS = (
    "id, purpose, user_id, payload, code_hash, code_expires_at, attempts, "
    "resends, last_sent_at, verified_at, consumed_at, created_at"
)


class LifecycleError(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message
        super().__init__(message)


class UserLifecycleRepository:
    def __init__(self, database):
        self.database = database

    def transact(self, operation):
        try:
            with self.database.transaction() as connection:
                with closing(connection.cursor()) as cursor:
                    result = operation(cursor)
            # Expected domain failures may include durable wrong-attempt writes.
            # Raise only after commit so those writes are never rolled back.
            if isinstance(result, LifecycleError):
                raise result
            return result
        except Exception as error:
            detail = error.args[0] if error.args else None
            if isinstance(detail, dict) and detail.get('C') == '23505':
                raise LifecycleError(409, 'Email or username already in use') from None
            raise

    @staticmethod
    def user(cursor, user_id):
        cursor.execute(f"SELECT {USER_COLUMNS} FROM public.users WHERE id=%s FOR UPDATE", (user_id,))
        return CanonicalAuthRepository._user(cursor.fetchone())

    @staticmethod
    def email_user(cursor, email):
        cursor.execute(f"SELECT {USER_COLUMNS} FROM public.users WHERE lower(email)=lower(%s) FOR UPDATE", (email,))
        return CanonicalAuthRepository._user(cursor.fetchone())

    @staticmethod
    def identifiers(cursor, email, username, user_id=None):
        # Serialize cross-column races as well as ordinary unique-index races.
        for identifier in sorted({email.lower(), username.lower()}):
            cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(lower(%s),0))", (identifier,))
        cursor.execute(
            "SELECT email,username FROM public.users WHERE "
            "(lower(email) IN (lower(%s),lower(%s)) OR lower(username) IN (lower(%s),lower(%s))) "
            "AND (%s::bigint IS NULL OR id<>%s)",
            (email, username, email, username, user_id, user_id),
        )
        for existing_email, existing_username in cursor.fetchall():
            if email.lower() == existing_email.lower():
                return LifecycleError(409, 'Email already in use')
            if username.lower() == existing_username.lower():
                return LifecycleError(409, 'Username already in use')
            return LifecycleError(409, 'Email or username conflicts with an existing login identifier')
        return None

    @staticmethod
    def insert_challenge(cursor, record):
        columns = list(record)
        values = [json.dumps(value) if key == 'payload' else value for key, value in record.items()]
        cursor.execute(
            'INSERT INTO public.user_lifecycle_challenges (' + ','.join(columns) + ') VALUES ('
            + ','.join(['%s'] * len(columns)) + ')', tuple(values),
        )

    @staticmethod
    def challenge(cursor, challenge_id, purpose, *, lock=True):
        cursor.execute(
            f'SELECT {CHALLENGE_COLUMNS} FROM public.user_lifecycle_challenges WHERE id=%s AND purpose=%s'
            + (' FOR UPDATE' if lock else ''),
            (challenge_id, purpose),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        result = dict(zip((column[0] for column in cursor.description), row))
        if isinstance(result['payload'], str):
            result['payload'] = json.loads(result['payload'])
        return result

    @staticmethod
    def update_challenge(cursor, challenge_id, **fields):
        cursor.execute(
            'UPDATE public.user_lifecycle_challenges SET '
            + ','.join(key + '=%s' for key in fields) + ' WHERE id=%s',
            (*fields.values(), challenge_id),
        )

    @staticmethod
    def delete_challenge(cursor, challenge_id, purpose):
        cursor.execute('DELETE FROM public.user_lifecycle_challenges WHERE id=%s AND purpose=%s',
                       (challenge_id, purpose))

    @staticmethod
    def invalidate_user_challenges(cursor, user_id):
        # Caller holds the user lock; all existing-user operations lock it first.
        cursor.execute('DELETE FROM public.user_lifecycle_challenges WHERE user_id=%s AND purpose IN (1,2)',
                       (user_id,))

    @staticmethod
    def cleanup(cursor, now, limit, pending_seconds, reset_seconds, unlock_seconds):
        cursor.execute("SET LOCAL statement_timeout = '250ms'")
        cursor.execute("SET LOCAL lock_timeout = '100ms'")
        cursor.execute(
            'DELETE FROM public.user_lifecycle_challenges WHERE id IN ('
            'SELECT id FROM public.user_lifecycle_challenges WHERE consumed_at IS NOT NULL OR '
            '(verified_at IS NULL AND created_at <= %s::timestamptz - %s * INTERVAL \'1 second\') OR '
            '(verified_at IS NOT NULL AND (purpose=0 OR '
            '(purpose=1 AND verified_at <= %s::timestamptz - %s * INTERVAL \'1 second\') OR '
            '(purpose=2 AND verified_at <= %s::timestamptz - %s * INTERVAL \'1 second\'))) '
            'ORDER BY created_at,id LIMIT %s FOR UPDATE SKIP LOCKED) RETURNING id',
            (now, pending_seconds, now, reset_seconds, now, unlock_seconds, limit),
        )
        return len(cursor.fetchall())
