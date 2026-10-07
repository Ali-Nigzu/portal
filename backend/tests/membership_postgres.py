"""Disposable localhost PostgreSQL fixture; never points at canonical GCP."""

import os
from contextlib import closing
from pathlib import Path
from uuid import uuid4

import pg8000.dbapi
from sqlalchemy.pool import QueuePool

from backend.app.services.dashboard_postgres import DashboardPostgres

SCHEMA = """
CREATE TABLE public.users (
 id bigint PRIMARY KEY, email text NOT NULL, username text NOT NULL,
 phone_number text, password_hash text NOT NULL, status smallint NOT NULL CHECK(status IN (0,1)),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_ci ON public.users(lower(email));
CREATE UNIQUE INDEX users_username_ci ON public.users(lower(username));
CREATE TABLE public.organisations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE public.memberships (
 user_id bigint NOT NULL REFERENCES public.users(id), organisation_id bigint NOT NULL REFERENCES public.organisations(id),
 role smallint NOT NULL CHECK(role IN (0,1)), status smallint NOT NULL CONSTRAINT existing_status_constraint CHECK(status IN (0,1)),
 created_at timestamptz NOT NULL, PRIMARY KEY(user_id,organisation_id)
);
CREATE TABLE public.sites (id bigint PRIMARY KEY, organisation_id bigint NOT NULL REFERENCES public.organisations(id), name text NOT NULL, UNIQUE(organisation_id,name));
INSERT INTO public.users(id,email,username,password_hash,status) VALUES
 (0,'owner@example.com','owner','not-exposed',1),
 (1,'member@example.com','member','not-exposed',1),
 (2,'third@example.com','third','not-exposed',1),
 (3,'disabled@example.com','disabled','not-exposed',0),
 (4,'other@example.com','member@example.com','not-exposed',1);
INSERT INTO public.organisations(name) VALUES ('Demo');
INSERT INTO public.memberships VALUES(0,1,0,1,now() - INTERVAL '1 year');
"""


class LocalPostgres:
    def __init__(self, lifecycle=True):
        port = os.getenv("PORTAL_TEST_POSTGRES_PORT")
        if not port:
            raise RuntimeError(
                "Set PORTAL_TEST_POSTGRES_PORT for a disposable localhost PostgreSQL server"
            )
        self.port = int(port)
        self.name = "portal_memberships_test_" + uuid4().hex
        self.admin = self.connect("postgres")
        self.admin.autocommit = True
        with closing(self.admin.cursor()) as cursor:
            cursor.execute(f'CREATE DATABASE "{self.name}"')
        self.database = DashboardPostgres()
        self.database._pool = QueuePool(self.checkout, pool_size=4, max_overflow=0)
        with self.database.connection() as connection:
            with closing(connection.cursor()) as cursor:
                cursor.execute(SCHEMA)

        if lifecycle:
            migration = Path(__file__).resolve().parents[1] / 'migrations/002_canonical_user_lifecycle.sql'
            with self.database.connection() as connection:
                with closing(connection.cursor()) as cursor:
                    cursor.execute(migration.read_text())

    def connect(self, name):
        return pg8000.dbapi.connect(
            user="postgres", host="127.0.0.1", port=self.port, database=name
        )

    def checkout(self):
        connection = self.connect(self.name)
        connection.autocommit = True
        return connection

    def migrate(self):
        path = (
            Path(__file__).resolve().parents[1]
            / "migrations/001_organisation_membership_states.sql"
        )
        with self.database.connection() as connection:
            with closing(connection.cursor()) as cursor:
                cursor.execute(path.read_text())

    def query(self, sql, parameters=()):
        with self.database.connection() as connection:
            with closing(connection.cursor()) as cursor:
                cursor.execute(sql, parameters)
                return list(cursor.fetchall()) if cursor.description else []

    def close(self):
        self.database.close()
        with closing(self.admin.cursor()) as cursor:
            cursor.execute(f'DROP DATABASE "{self.name}" WITH (FORCE)')
        self.admin.close()
