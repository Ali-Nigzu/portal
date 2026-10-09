"""Application factory for the camOS API."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api import admin, auth
from backend.app.compatibility.api import dashboards, snapshots
from backend.app.api import demo, documents
from backend.app.api import demo_dashboard
from backend.app.api import portal
from backend.app.api import authenticated_portal
from backend.app.api import organisation_memberships
from backend.app.services.organisation_memberships import OrganisationMemberships
from backend.app.services.organisation_membership_repository import OrganisationMembershipRepository
from backend.app.services.portal_context import PortalMetadata
from backend.app.services.portal_events import EventLogs
from backend.app.services.portal_alarms import AlarmLogs
from backend.app.services.portal_devices import PortalDevices
from backend.app.services.portal_reports import PortalReports
from backend.app.services.dashboard_postgres import DashboardPostgres
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.user_lifecycle import UserLifecycle
from backend.app.services.user_lifecycle_repository import UserLifecycleRepository
from backend.app.services.organisation_dashboard import OrganisationDashboard
from backend.app.config import get_allowed_origins
from backend.app.spa import configure_spa

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ANALYTICS_OFFLINE_MODE = os.getenv("ANALYTICS_OFFLINE_MODE", "").lower() == "true"


def create_app() -> FastAPI:
    app = FastAPI(
        title="camOS Analytics API",
        description="Intelligent CCTV data analytics with auto-scaling insights",
        version="2.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    allowed_origins = get_allowed_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    )

    app.include_router(auth.router)
    app.include_router(demo.router)
    app.include_router(demo_dashboard.router)
    app.include_router(portal.router)
    app.include_router(authenticated_portal.router)
    app.include_router(organisation_memberships.router)
    app.include_router(admin.router)
    app.include_router(snapshots.router)
    app.include_router(dashboards.router)
    app.include_router(documents.router)

    configure_spa(app)

    from backend.app.services.documents_service import DocumentsService
    from backend.app.data.gcs_documents_store import GcsDocumentsStore
    from backend.app.services.bigquery_client import bigquery_client
    from backend.app.services.admin_repository import AdminRepository

    documents_store = GcsDocumentsStore(os.getenv("PORTAL_DOCUMENTS_BUCKET", "camos-prod-1"))
    app.state.documents_service = DocumentsService(documents_store)
    dashboard_database = DashboardPostgres()
    app.state.admin_repository = AdminRepository(dashboard_database)
    app.state.auth_repository = CanonicalAuthRepository(dashboard_database)
    app.state.user_lifecycle = UserLifecycle(UserLifecycleRepository(dashboard_database))
    app.state.organisation_memberships = OrganisationMemberships(OrganisationMembershipRepository(dashboard_database))
    app.state.organisation_dashboard = OrganisationDashboard(dashboard_database)
    app.state.portal_metadata = PortalMetadata(dashboard_database, app.state.organisation_dashboard)
    app.state.portal_events = EventLogs(bigquery_client)
    app.state.portal_alarms = AlarmLogs(dashboard_database)
    app.state.portal_devices = PortalDevices(dashboard_database, bigquery_client)
    app.state.portal_reports = PortalReports(dashboard_database)

    @app.on_event("shutdown")
    def close_dashboard_database() -> None:
        first_error = None
        for resource in (documents_store, dashboard_database, bigquery_client):
            try:
                resource.close()
            except Exception as exc:
                if first_error is None:
                    first_error = exc
        if first_error is not None:
            raise first_error

    @app.on_event("startup")
    def cleanup_lifecycle_rows() -> None:
        lifecycle = getattr(app.state, "user_lifecycle", None)
        if lifecycle is not None:
            lifecycle.cleanup_expired()

    @app.on_event("startup")
    async def startup_health_check() -> None:
        """Run a lightweight BigQuery connectivity check on startup."""
        if ANALYTICS_OFFLINE_MODE:
            logger.info(
                "Analytics offline mode enabled; skipping BigQuery startup health check"
            )
            return
        try:
            from backend.app.services.bigquery_client import bigquery_client

            bigquery_client.run_health_check()
        except Exception as exc:
            logger.error("BigQuery startup health check failed: %s", exc)
            return

    return app
