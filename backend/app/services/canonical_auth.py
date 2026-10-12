"""Canonical Postgres user, membership, and organisation access reads."""

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from threading import Lock
from time import monotonic
from .auth_budgets import consume_budget
from .user_policy import username_value

ADMIN_ID = 999999
USER_COLUMNS = 'id,email,username,phone_number,password_hash,status,session_version'
_budget_cleanup_lock = Lock()
_last_budget_cleanup = 0


class ReservedCustomerId(ValueError):
    pass


def require_customer_id(user_id):
    if int(user_id) == ADMIN_ID:
        raise ReservedCustomerId('Reserved Admin ID cannot be allocated to a customer. Please retry.')


@dataclass(frozen=True)
class CanonicalUser:
    id: int
    email: str
    username: str
    phone_number: str | None
    password_hash: str | None
    status: int
    session_version: int = 0


@dataclass(frozen=True)
class Membership:
    organisation_id: int
    role: int


class CanonicalAuthRepository:
    def __init__(self, database):
        self.database = database

    def password_attempt_allowed(self, identifier, *, namespace='customer'):
        self._cleanup_password_budgets()
        with self.database.transaction() as connection:
            cursor = connection.cursor()
            try:
                return consume_budget(cursor, 2, identifier.strip().lower(), datetime.now(timezone.utc),
                                      namespace='password-' + namespace, limit=30, window_seconds=900)
            finally:
                cursor.close()

    def _cleanup_password_budgets(self):
        # Opportunistic maintenance only; the row lock/expiry remains the
        # cross-instance authority. Login-only traffic must also retire rows.
        global _last_budget_cleanup
        with _budget_cleanup_lock:
            if monotonic() - _last_budget_cleanup < 60:
                return
            _last_budget_cleanup = monotonic()
        try:
            with self.database.transaction() as connection:
                cursor = connection.cursor()
                try:
                    cursor.execute("SET LOCAL statement_timeout = '250ms'")
                    cursor.execute("SET LOCAL lock_timeout = '100ms'")
                    cursor.execute("DELETE FROM public.user_lifecycle_challenges WHERE id IN ("
                                   "SELECT id FROM public.user_lifecycle_challenges WHERE id >= 'budget:' AND id < 'budget;' "
                                   "AND code_expires_at <= CURRENT_TIMESTAMP ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED)")
                finally:
                    cursor.close()
        except Exception:
            logging.getLogger(__name__).warning('account.budget_cleanup_deferred')

    @staticmethod
    def create_customer(cursor, email, username, phone=None, password_hash=None):
        """Caller owns the transaction. Exceptions must roll back this insertion."""
        username = username_value(username)
        cursor.execute(
            'INSERT INTO public.users(email,username,phone_number,password_hash,status,created_at) '
            f'VALUES(%s,%s,%s,%s,1,CURRENT_TIMESTAMP) RETURNING {USER_COLUMNS}',
            (email, username, phone, password_hash),
        )
        user = CanonicalAuthRepository._user(cursor.fetchone())
        require_customer_id(user.id)
        return user

    @staticmethod
    def _user(row) -> CanonicalUser | None:
        if row is None:
            return None
        return CanonicalUser(
            id=int(row[0]), email=str(row[1]), username=str(row[2]),
            phone_number=row[3], password_hash=row[4], status=int(row[5]),
            session_version=int(row[6]),
        )

    def find_email(self, email: str) -> CanonicalUser | None:
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                return self.resolve_email(cursor, email)
            finally:
                cursor.close()

    @staticmethod
    def resolve_email(cursor, email: str, *, lock: bool = False) -> CanonicalUser | None:
        """Email is the sole customer authentication identifier."""
        cursor.execute(
            "SELECT id, email, username, phone_number, password_hash, status, session_version "
            "FROM public.users WHERE lower(email) = lower(%s)"
            + (" FOR UPDATE" if lock else ""),
            (email,),
        )
        return CanonicalAuthRepository._user(cursor.fetchone())

    def find_username(self, username: str) -> CanonicalUser | None:
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT id,email,username,phone_number,password_hash,status,session_version "
                    "FROM public.users WHERE id=999999 AND lower(username)=lower(%s)", (username,),
                )
                return self._user(cursor.fetchone())
            finally:
                cursor.close()

    def get_enabled_user(self, user_id: int) -> CanonicalUser | None:
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT id, email, username, phone_number, password_hash, status, session_version "
                    "FROM public.users WHERE id = %s AND status = 1",
                    (user_id,),
                )
                row = cursor.fetchone()
            finally:
                cursor.close()
        return self._user(row)

    def organisations(self, user_id: int) -> list[dict]:
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT o.id, o.name, m.role, s.id, s.name FROM public.memberships m "
                    "JOIN public.organisations o ON o.id = m.organisation_id "
                    "LEFT JOIN public.sites s ON s.organisation_id = o.id "
                    "WHERE m.user_id = %s AND m.status = 1 AND o.enabled = TRUE "
                    "ORDER BY o.id, s.id",
                    (user_id,),
                )
                rows = cursor.fetchall()
            finally:
                cursor.close()
        organisations = {}
        for organisation_id, name, role, site_id, site_name in rows:
            organisation = organisations.setdefault(
                organisation_id,
                dict(id=str(organisation_id), name=name, role=int(role), sites=[]),
            )
            if site_id is not None:
                organisation["sites"].append(dict(id=str(site_id), name=site_name))
        return list(organisations.values())

    def enabled_membership(self, user_id: int, organisation_id: int) -> Membership | None:
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT m.organisation_id, m.role FROM public.memberships m "
                    "JOIN public.organisations o ON o.id = m.organisation_id "
                    "WHERE m.user_id = %s AND m.organisation_id = %s "
                    "AND m.status = 1 AND o.enabled = TRUE",
                    (user_id, organisation_id),
                )
                row = cursor.fetchone()
            finally:
                cursor.close()
        return Membership(int(row[0]), int(row[1])) if row else None
