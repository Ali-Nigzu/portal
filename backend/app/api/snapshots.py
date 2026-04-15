"""Snapshot endpoints."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from backend.app.services.auth_context import resolve_snapshot_org
from backend.app.snapshots import (
    SNAPSHOT_ORG_IDS,
    SnapshotLookupError,
    fetch_latest_snapshot,
    fetch_latest_snapshot_from_sqlite,
    is_snapshot_org,
)
from backend.app.services.demo_session import resolve_demo_org_id
from backend.app.services.local_data import (
    LocalDataError,
    ensure_local_db_exists,
    resolve_site_view,
    snapshot_db_for_site,
)

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.get("/snapshots/latest")
async def get_latest_snapshot(
    request: Request,
    org: Optional[str] = Query(None, alias="org"),
    ts: Optional[str] = Query(None, alias="ts"),
    view_token: Optional[str] = Query(None, alias="viewToken"),
    site_view: Optional[str] = Query(None, alias="siteView"),
):
    resolved_org = resolve_snapshot_org(org_id=org, view_token=view_token, request=request)
    if not is_snapshot_org(resolved_org):
        raise HTTPException(
            status_code=404,
            detail={
                "error": "unknown_org",
                "message": f"Snapshots are only available for {sorted(SNAPSHOT_ORG_IDS)}",
            },
        )

    resolved_ts: Optional[datetime] = None
    if ts:
        try:
            resolved_ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail={"error": "invalid_timestamp", "message": "ts must be ISO-8601"},
            ) from exc

    demo_org = resolve_demo_org_id(request)
    resolved_site_view = resolve_site_view(site_view)

    try:
        if demo_org:
            local_db = ensure_local_db_exists(
                snapshot_db_for_site(resolved_site_view),
                label=f"snapshot source for {resolved_site_view}",
            )
            snapshot = fetch_latest_snapshot_from_sqlite(
                local_db,
                org_id=resolved_org,
                as_of=resolved_ts,
            )
        else:
            snapshot = fetch_latest_snapshot(resolved_org, as_of=resolved_ts)
    except (SnapshotLookupError, LocalDataError) as exc:
        logger.error("Snapshot lookup failed for %s: %s", resolved_org, exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "snapshot_lookup_failed", "message": str(exc)},
        ) from exc

    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "snapshot_not_found", "message": "No snapshot found"},
        )

    return {
        "ts": snapshot.ts,
        "payload": snapshot.payload,
        "mode": "snapshots",
        "orgId": snapshot.org_id,
    }
