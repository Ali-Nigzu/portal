"""Public demo endpoints bound to a fixed organisation."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException

from backend.app.analytics.dashboard_catalogue import (
    ManifestValidationError,
    get_dashboard_manifest,
)
from backend.app.analytics.data_contract import Metric, compile_contract_query
from backend.app.services.bigquery_client import BigQueryDataFrameError, bigquery_client
from backend.app.snapshots import SnapshotLookupError, fetch_latest_snapshot
from backend.app.data.json_store import load_alarm_logs, load_device_lists, load_users
from backend.app.api.analytics import _resolve_event_search_context, _resolve_table_for_org

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


@router.get("/event-logs")
async def fetch_demo_event_logs(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event: Optional[str] = None,
    sex: Optional[str] = None,
    age: Optional[str] = None,
    race: Optional[str] = None,
    site_id: Optional[str] = None,
    camera_id: Optional[str] = None,
    track_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
):
    cache_key = (
        f"event-logs:{start_date}:{end_date}:{event}:{sex}:{age}:{race}:"
        f"{site_id}:{camera_id}:{track_id}:{page}:{per_page}"
    )
    cached = _get_cache(cache_key)
    if cached is not None:
        return cached
    try:
        org_id = DEMO_ORG_ID
        table_name = _resolve_table_for_org(org_id)
        base_ctx = _resolve_event_search_context(
            org_id=org_id,
            table_name=table_name,
            start_date=start_date,
            end_date=end_date,
            event=event,
            sex=sex,
            age=age,
            race=race,
            site_id=site_id,
            camera_id=camera_id,
            track_id=track_id,
        )
        summary_plan = compile_contract_query(Metric.EVENT_SUMMARY, base_ctx)
        summary_df = bigquery_client.query_dataframe(
            summary_plan.sql,
            summary_plan.params,
            job_context=f"{table_name}::demo_search_summary",
        )
        total_count = int(summary_df.iloc[0]["total_records"]) if not summary_df.empty else 0
        if total_count == 0:
            payload = {
                "events": [],
                "total": 0,
                "page": page,
                "per_page": per_page,
                "total_pages": 0,
            }
            _set_cache(cache_key, payload)
            return payload
        offset = max(page - 1, 0) * per_page
        paged_ctx = base_ctx.model_copy(update={"limit": per_page, "offset": offset})
        events_plan = compile_contract_query(Metric.RAW_EVENTS, paged_ctx)
        results_df = bigquery_client.query_dataframe(
            events_plan.sql,
            events_plan.params,
            job_context=f"{table_name}::demo_search_results",
        )
        events = []
        for _, row in results_df.iterrows():
            timestamp = pd.to_datetime(row["timestamp"])
            events.append(
                {
                    "site_id": row["site_id"],
                    "cam_id": row["cam_id"],
                    "track_number": row["track_id"],
                    "track_id": row["track_id"],
                    "event": "entry" if row["event"] == 1 else "exit",
                    "timestamp": timestamp.isoformat(),
                    "sex": row["sex"],
                    "age_estimate": row["age_bucket"],
                    "race": row["race"],
                }
            )
        payload = {
            "events": events,
            "total": total_count,
            "page": page,
            "per_page": per_page,
            "total_pages": (total_count + per_page - 1) // per_page,
        }
        _set_cache(cache_key, payload)
        return payload
    except BigQueryDataFrameError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "BigQuery dataframe conversion failed",
                "job_id": exc.job_id,
            },
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to search events: {exc}") from exc


@router.get("/alarm-logs")
async def fetch_demo_alarm_logs():
    cached = _get_cache("alarm-logs")
    if cached is not None:
        return cached
    alarm_data = load_alarm_logs()
    alarms = alarm_data.get(DEMO_ORG_ID, [])
    payload = {"alarms": alarms, "client_id": DEMO_ORG_ID}
    _set_cache("alarm-logs", payload)
    return payload


@router.get("/device-list")
async def fetch_demo_device_list():
    cached = _get_cache("device-list")
    if cached is not None:
        return cached
    device_data = load_device_lists()
    devices = device_data.get(DEMO_ORG_ID, [])
    users = load_users()
    data_sources = []
    if DEMO_ORG_ID in users:
        data_sources = users[DEMO_ORG_ID].get("data_sources", [])
    payload = {
        "devices": devices,
        "client_id": DEMO_ORG_ID,
        "data_sources": data_sources,
    }
    _set_cache("device-list", payload)
    return payload
