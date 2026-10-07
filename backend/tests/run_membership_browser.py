"""Real API + disposable local PostgreSQL for the browser acceptance suite.

This is a test runner, never a product mode. It creates/removes its own database
and never connects to GCP. Start Vite separately on port 3000.
"""

import os

import uvicorn
from argon2 import PasswordHasher
from fastapi import FastAPI

from backend.app.api import auth, authenticated_portal, organisation_memberships
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.organisation_dashboard import OrganisationDashboard
from backend.app.services.organisation_membership_repository import (
    OrganisationMembershipRepository,
)
from backend.app.services.organisation_memberships import OrganisationMemberships
from backend.app.services.portal_alarms import AlarmLogs
from backend.app.services.portal_context import PortalMetadata
from backend.app.services.portal_devices import PortalDevices
from backend.app.services.portal_events import EventLogs
from backend.app.services.portal_reports import PortalReports
from backend.tests.membership_postgres import LocalPostgres


class NoAnalytics:
    def portal_rows(self, *args, **kwargs):
        raise AssertionError("Zero-site tenancy tests must not query analytics")


def main():
    if os.getenv("NODE_ENV") == "production":
        raise RuntimeError("This test runner is forbidden in production")
    pg = LocalPostgres()
    try:
        pg.migrate()
        pg.query(
            "UPDATE public.users SET password_hash=%s",
            (PasswordHasher().hash("canonical-browser-test"),),
        )
        pg.query(
            "ALTER SEQUENCE public.organisations_id_seq RESTART WITH 900000000000000101"
        )
        pg.query(
            "ALTER TABLE public.sites ADD COLUMN enabled boolean NOT NULL DEFAULT true, ADD COLUMN max_capacity integer NOT NULL DEFAULT 10"
        )
        pg.query(
            "CREATE TABLE public.devices(id bigint PRIMARY KEY, site_id bigint, name text, analyzed_until timestamptz)"
        )
        pg.query("CREATE TABLE public.gateways(gateway_id bigint, site_id bigint)")
        pg.query(
            "CREATE TABLE public.organisation_snapshots(organisation_id bigint, ts timestamptz, payload jsonb)"
        )
        pg.query(
            "CREATE TABLE public.site_snapshots(site_id bigint, ts timestamptz, payload jsonb)"
        )
        os.environ["PORTAL_SESSION_SECRET"] = (
            "local-browser-session-signing-test-only-" * 2
        )
        os.environ["PORTAL_SESSION_SECURE"] = "false"
        app = FastAPI()
        db = pg.database
        app.state.auth_repository = CanonicalAuthRepository(db)
        app.state.organisation_memberships = OrganisationMemberships(
            OrganisationMembershipRepository(db)
        )
        app.state.organisation_dashboard = OrganisationDashboard(db)
        app.state.portal_metadata = PortalMetadata(db, app.state.organisation_dashboard)
        app.state.portal_devices = PortalDevices(db, NoAnalytics())
        app.state.portal_events = EventLogs(NoAnalytics())
        app.state.portal_alarms = AlarmLogs(db)
        app.state.portal_reports = PortalReports(db)
        app.include_router(auth.router)
        app.include_router(authenticated_portal.router)
        app.include_router(organisation_memberships.router)
        uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
    finally:
        pg.close()


if __name__ == "__main__":
    main()
