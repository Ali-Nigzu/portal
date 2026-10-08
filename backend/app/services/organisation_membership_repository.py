"""Canonical membership persistence. Mutation calls share one transaction."""

from contextlib import contextmanager

DISABLED, ACTIVE, INVITED, REQUESTED = range(4)
OWNER, MEMBER = range(2)


@contextmanager
def cursor_for(connection):
    cursor = connection.cursor()
    try:
        yield cursor
    finally:
        cursor.close()


class OrganisationMembershipRepository:
    def __init__(self, database):
        self.database = database

    def lock(self, connection, organisation_id):
        # Serialize all membership writers, including absent relationships and
        # last-owner checks, without requiring UPDATE on organisations.
        with cursor_for(connection) as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (f"camos:memberships:{organisation_id}",),
            )

    def enabled_user(self, connection, user_id):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "SELECT id FROM public.users WHERE id = %s AND status = 1", (user_id,)
            )
            return cursor.fetchone() is not None

    def organisation(self, connection, organisation_id):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "SELECT id, name FROM public.organisations WHERE id = %s AND enabled = TRUE",
                (organisation_id,),
            )
            row = cursor.fetchone()
        return {"id": str(row[0]), "name": row[1]} if row else None

    def disable_organisation(self, connection, organisation_id):
        with cursor_for(connection) as cursor:
            cursor.execute("UPDATE public.organisations SET enabled=FALSE WHERE id=%s", (organisation_id,))

    def create_organisation(self, connection, name):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "INSERT INTO public.organisations (name) VALUES (%s) RETURNING id, name",
                (name,),
            )
            row = cursor.fetchone()
        return {"id": str(row[0]), "name": row[1]}

    def invite_target(self, connection, identifier_type, identifier):
        # Column is selected exclusively from server-owned literals.
        column = {"email": "email", "username": "username"}[identifier_type]
        with cursor_for(connection) as cursor:
            cursor.execute(
                f"SELECT id, username, email, status FROM public.users WHERE lower({column}) = lower(%s)",
                (identifier,),
            )
            row = cursor.fetchone()
        return (
            dict(user_id=str(row[0]), username=row[1], email=row[2], user_status=row[3])
            if row
            else None
        )

    @staticmethod
    def relationship(row):
        return (
            dict(
                user_id=str(row[0]),
                organisation_id=str(row[1]),
                role=int(row[2]),
                status=int(row[3]),
                created_at=row[4],
                status_changed_at=row[5],
            )
            if row
            else None
        )

    def membership(self, connection, user_id, organisation_id):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "SELECT user_id, organisation_id, role, status, created_at, status_changed_at "
                "FROM public.memberships WHERE user_id = %s AND organisation_id = %s",
                (user_id, organisation_id),
            )
            return self.relationship(cursor.fetchone())

    def insert(self, connection, user_id, organisation_id, role, status):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "INSERT INTO public.memberships "
                "(user_id, organisation_id, role, status, created_at, status_changed_at) "
                "VALUES (%s, %s, %s, %s, clock_timestamp(), clock_timestamp()) "
                "RETURNING user_id, organisation_id, role, status, created_at, status_changed_at",
                (user_id, organisation_id, role, status),
            )
            return self.relationship(cursor.fetchone())

    def transition(self, connection, previous, role, status):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "UPDATE public.memberships SET role = %s, status = %s, "
                "status_changed_at = GREATEST(clock_timestamp(), status_changed_at + INTERVAL '1 microsecond') "
                "WHERE user_id = %s AND organisation_id = %s AND status = %s "
                "AND status_changed_at IS NOT DISTINCT FROM %s "
                "RETURNING user_id, organisation_id, role, status, created_at, status_changed_at",
                (
                    role,
                    status,
                    int(previous["user_id"]),
                    int(previous["organisation_id"]),
                    previous["status"],
                    previous["status_changed_at"],
                ),
            )
            return self.relationship(cursor.fetchone())

    def owner_count(self, connection, organisation_id):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "SELECT count(*) FROM public.memberships m JOIN public.users u ON u.id = m.user_id "
                "WHERE m.organisation_id = %s AND m.role = 0 AND m.status = 1 AND u.status = 1",
                (organisation_id,),
            )
            return int(cursor.fetchone()[0])

    def roster(self, connection, organisation_id):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "SELECT m.user_id, m.organisation_id, m.role, m.status, m.created_at, m.status_changed_at, "
                "u.username, u.email, u.status FROM public.memberships m JOIN public.users u ON u.id = m.user_id "
                "WHERE m.organisation_id = %s AND m.status IN (1, 2, 3) ORDER BY lower(u.username), u.id",
                (organisation_id,),
            )
            rows = cursor.fetchall()
        return [
            dict(
                self.relationship(row[:6]),
                username=row[6],
                email=row[7],
                user_enabled=row[8] == 1,
            )
            for row in rows
        ]

    def pending(self, connection, user_id):
        with cursor_for(connection) as cursor:
            cursor.execute(
                "SELECT m.user_id, m.organisation_id, m.role, m.status, m.created_at, m.status_changed_at, o.name "
                "FROM public.memberships m JOIN public.organisations o ON o.id = m.organisation_id "
                "WHERE m.user_id = %s AND m.status IN (2, 3) AND o.enabled = TRUE "
                "ORDER BY m.status_changed_at DESC, o.id",
                (user_id,),
            )
            rows = cursor.fetchall()
        return [
            dict(self.relationship(row[:6]), organisation_name=row[6]) for row in rows
        ]
