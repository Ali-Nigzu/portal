"""Dashboard manifest endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from backend.app.analytics.dashboard_catalogue import (
    ManifestValidationError,
    get_dashboard_manifest,
    remove_widget_from_manifest,
)
from backend.app.models import DashboardManifest
from backend.app.services.auth_context import resolve_view_token_context

router = APIRouter(prefix="/api")


@router.get("/dashboards/{dashboard_id}", response_model=DashboardManifest)
async def fetch_dashboard_manifest(
    dashboard_id: str,
    request: Request,
    org_id: Optional[str] = Query(None, alias="orgId"),
    view_token: Optional[str] = Query(None, alias="viewToken"),
):
    """Return the dashboard manifest for the requested organisation."""
    resolved_view_token = view_token or request.query_params.get("view_token")
    if resolved_view_token:
        org_id = resolve_view_token_context(resolved_view_token)

    if not org_id:
        raise HTTPException(
            status_code=400,
            detail={"error": "missing_org", "message": "orgId or viewToken is required"},
        )

    try:
        return get_dashboard_manifest(org_id=org_id, dashboard_id=dashboard_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "manifest_not_found", "message": str(exc)},
        ) from exc


@router.delete("/dashboards/{dashboard_id}/widgets/{widget_id}", response_model=DashboardManifest)
async def unpin_dashboard_widget(
    dashboard_id: str,
    widget_id: str,
    org_id: str = Query(..., alias="orgId"),
):
    """Remove a widget from the manifest for the given organisation."""
    try:
        return remove_widget_from_manifest(
            org_id=org_id,
            widget_id=widget_id,
            dashboard_id=dashboard_id,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "manifest_not_found", "message": str(exc)},
        ) from exc
    except ManifestValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "manifest_validation", "message": str(exc)},
        ) from exc
