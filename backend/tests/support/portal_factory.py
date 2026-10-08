"""Explicit isolated Portal fixture composition; no production mode selector."""
import os
from backend.app.app_factory import create_http_app
from backend.app.services.documents_service import DocumentsService
from backend.tests.support.memory_documents_store import MemoryDocumentsStore
from backend.tests.support.local_new_account import LocalNewAccountServices


def create_fixture_app():
    if os.getenv("NODE_ENV", "").lower() == "production":
        raise RuntimeError("Fixture application is forbidden in production")
    app = create_http_app()
    services = LocalNewAccountServices()
    for name in ("auth_repository", "organisation_dashboard", "portal_metadata",
                 "portal_events", "portal_alarms", "portal_devices", "portal_reports"):
        setattr(app.state, name, getattr(services, name))
    app.state.documents_service = DocumentsService(MemoryDocumentsStore())
    return app
