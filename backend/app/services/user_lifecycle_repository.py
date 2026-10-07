"""Parameterized canonical identity and challenge operations on one transaction."""

import json
from contextlib import closing

from .canonical_auth import CanonicalAuthRepository

USER_COLUMNS = (
    "id, email, username, phone_number, password_hash, status, "
    "session_version, account_version, document_owner_key"
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
            # Expected domain failures may include durable attempt/budget writes.
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
    def budget(cursor, key, now, limit=10):
        cursor.execute(
            "INSERT INTO public.user_lifecycle_limits(key,window_started_at,count) "
            "VALUES (%s,%s,1) ON CONFLICT(key) DO UPDATE SET "
            "count=CASE WHEN user_lifecycle_limits.window_started_at <= %s::timestamptz - INTERVAL '1 hour' "
            "THEN 1 ELSE user_lifecycle_limits.count+1 END, "
            "window_started_at=CASE WHEN user_lifecycle_limits.window_started_at <= %s::timestamptz - INTERVAL '1 hour' "
            "THEN %s ELSE user_lifecycle_limits.window_started_at END RETURNING count",
            (key, now, now, now, now),
        )
        return int(cursor.fetchone()[0]) <= limit

    @staticmethod
    def user(cursor, user_id):
        cursor.execute(f"SELECT {USER_COLUMNS} FROM public.users WHERE id=%s FOR UPDATE", (user_id,))
        return CanonicalAuthRepository._user(cursor.fetchone())

    @staticmethod
    def email_user(cursor, email):
        cursor.execute(f"SELECT {USER_COLUMNS} FROM public.users WHERE lower(email)=lower(%s)", (email,))
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
    def challenge(cursor, challenge_id, purpose):
        cursor.execute(
            'SELECT * FROM public.user_lifecycle_challenges WHERE id=%s AND purpose=%s FOR UPDATE',
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
