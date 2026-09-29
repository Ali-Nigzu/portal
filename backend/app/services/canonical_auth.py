"""Canonical Postgres user, membership, and organisation access reads."""

from dataclasses import dataclass


@dataclass(frozen=True)
class CanonicalUser:
    id: int
    email: str
    username: str
    phone_number: str | None
    password_hash: str
    status: int


@dataclass(frozen=True)
class Membership:
    organisation_id: int
    role: int


class CanonicalAuthRepository:
    def __init__(self, database):
        self.database = database

    @staticmethod
    def _user(row) -> CanonicalUser | None:
        if row is None:
            return None
        return CanonicalUser(
            id=int(row[0]), email=str(row[1]), username=str(row[2]),
            phone_number=row[3], password_hash=str(row[4]), status=int(row[5]),
        )

    def find_user(self, identifier: str) -> CanonicalUser | None:
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT id, email, username, phone_number, password_hash, status "
                    "FROM public.users WHERE lower(email) = lower(%s) "
                    "OR lower(username) = lower(%s) LIMIT 2",
                    (identifier, identifier),
                )
                rows = cursor.fetchall()
            finally:
                cursor.close()
        # Separate case-insensitive unique indexes do not prevent a cross-column
        # collision. Never choose an identity ambiguously.
        return self._user(rows[0]) if len(rows) == 1 else None

    def get_enabled_user(self, user_id: int) -> CanonicalUser | None:
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT id, email, username, phone_number, password_hash, status "
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
                    "SELECT o.id, o.name, m.role FROM public.memberships m "
                    "JOIN public.organisations o ON o.id = m.organisation_id "
                    "WHERE m.user_id = %s AND m.status = 1 AND o.enabled = TRUE "
                    "ORDER BY o.id",
                    (user_id,),
                )
                rows = cursor.fetchall()
            finally:
                cursor.close()
        return [dict(id=str(row[0]), name=row[1], role=int(row[2])) for row in rows]

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
