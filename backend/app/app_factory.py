"""Application factory for the camOS API."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api import admin, analytics, auth, client_data, dashboards, snapshots
from backend.app.api import demo
from backend.app.config import get_allowed_origins
from backend.app.services.bigquery_client import bigquery_client
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

    @app.on_event("startup")
    async def startup_health_check() -> None:
        """Run a lightweight BigQuery connectivity check on startup."""
        if ANALYTICS_OFFLINE_MODE:
            logger.info("Analytics offline mode enabled; skipping BigQuery startup health check")
            return
        try:
            bigquery_client.run_health_check()
        except Exception as exc:
            logger.error("BigQuery startup health check failed: %s", exc)
            return

    app.include_router(auth.router)
    app.include_router(demo.router)
    app.include_router(admin.router)
    app.include_router(client_data.router)
    app.include_router(analytics.router)
    app.include_router(snapshots.router)
    app.include_router(dashboards.router)

    configure_spa(app)

    return app
