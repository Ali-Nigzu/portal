"""Canonical Admin/customer acceptance runtime; disposable local PostgreSQL only."""

import os
import uvicorn
from fastapi import FastAPI
from backend.tests.admin_postgres import database
from backend.app.api import admin, auth, authenticated_portal, organisation_memberships
from backend.app.services.admin_repository import AdminRepository
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.organisation_dashboard import OrganisationDashboard
from backend.app.services.organisation_memberships import OrganisationMemberships
from backend.app.services.organisation_membership_repository import (
    OrganisationMembershipRepository,
)
from backend.app.services.portal_context import PortalMetadata
from backend.app.services.portal_devices import PortalDevices
from backend.app.services.portal_alarms import AlarmLogs
from backend.app.services.portal_reports import PortalReports
from backend.app.services.passwords import hash_password


class NoAnalytics:
    def portal_rows(self, *args, **kwargs):
        return []


def main():
    if os.getenv("NODE_ENV") == "production":
        raise RuntimeError("Test runner forbidden in production")
    os.environ["PORTAL_SESSION_SECRET"] = "isolated-admin-browser-session-secret-" * 2
    os.environ["PORTAL_SESSION_SECURE"] = "false"
    db = database()
    try:
        h = hash_password("isolated-admin-browser-password")
        db.query("UPDATE public.users SET password_hash=%s", (h,))
        db.query(
            "INSERT INTO public.users(id,email,username,password_hash,status,created_at) VALUES(999999,%s,%s,%s,1,now())",
            ("admin-browser@test.invalid", "admin-browser", h),
        )
        db.query(
            "INSERT INTO public.memberships(user_id,organisation_id,role,status,created_at) VALUES(1,1,1,1,now())"
        )
        app = FastAPI()
        app.state.auth_repository = CanonicalAuthRepository(db.database)
        app.state.admin_repository = AdminRepository(db.database)
        app.state.organisation_memberships = OrganisationMemberships(
            OrganisationMembershipRepository(db.database)
        )
        app.state.organisation_dashboard = OrganisationDashboard(db.database)
        app.state.portal_metadata = PortalMetadata(
            db.database, app.state.organisation_dashboard
        )
        app.state.portal_devices = PortalDevices(db.database, NoAnalytics())
        app.state.portal_alarms = AlarmLogs(db.database)
        app.state.portal_reports = PortalReports(db.database)
        for r in (
            admin.router,
            auth.router,
            authenticated_portal.router,
            organisation_memberships.router,
        ):
            app.include_router(r)
        uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
    finally:
        db.close()


if __name__ == "__main__":
    main()
