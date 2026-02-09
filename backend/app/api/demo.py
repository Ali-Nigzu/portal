"""Public demo endpoints bound to a fixed organisation."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

from backend.app.analytics.dashboard_catalogue import (
    ManifestValidationError,
    get_dashboard_manifest,
)
from backend.app.snapshots import SnapshotLookupError, fetch_latest_snapshot

router = APIRouter(prefix="/api/demo")
logger = logging.getLogger(__name__)

DEMO_ORG_ID = "client1"
_CACHE_TTL_SECONDS = 60
_CACHE: Dict[str, Dict[str, Any]] = {}


def _get_cache(key: str) -> Optional[Any]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time.monotonic() - entry["ts"] > _CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return entry["value"]


def _set_cache(key: str, value: Any) -> None:
    _CACHE[key] = {"ts": time.monotonic(), "value": value}


def _ensure_snapshot_env() -> None:
    if not os.getenv("BQ_PROJECT") or not os.getenv("BQ_DATASET"):
        raise HTTPException(
            status_code=500,
            detail="BQ_PROJECT and BQ_DATASET must be set for demo snapshots",
        )


@router.get("/dashboards/{dashboard_id}")
async def fetch_demo_dashboard_manifest(dashboard_id: str):
    cleaned_dashboard_id = dashboard_id.strip() if dashboard_id else ""
    if not cleaned_dashboard_id or cleaned_dashboard_id.lower() in {"undefined", "null"}:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_dashboard_id", "message": "dashboard_id is required"},
        )
    logger.info(
        "demo.dashboard_manifest.request",
        extra={"org_id": DEMO_ORG_ID, "dashboard_id": cleaned_dashboard_id},
    )
    cache_key = f"manifest:{cleaned_dashboard_id}"
    cached = _get_cache(cache_key)
    if cached is not None:
        return cached
    try:
        payload = get_dashboard_manifest(
            org_id=DEMO_ORG_ID,
            dashboard_id=cleaned_dashboard_id,
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
    _set_cache(cache_key, payload)
    return payload


@router.get("/snapshots/latest")
async def fetch_demo_latest_snapshot():
    cached = _get_cache("snapshot:latest")
    if cached is not None:
        return cached
    _ensure_snapshot_env()
    try:
        snapshot = fetch_latest_snapshot(DEMO_ORG_ID)
    except SnapshotLookupError as exc:
        raise HTTPException(
            status_code=500,
            detail={"error": "snapshot_lookup_failed", "message": str(exc)},
        ) from exc
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "snapshot_not_found", "message": "No snapshot found"},
        )
    payload = {
        "ts": snapshot.ts,
        "payload": snapshot.payload,
        "mode": "snapshots",
        "orgId": snapshot.org_id,
    }
    _set_cache("snapshot:latest", payload)
    return payload
