"""Analytics query endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Request

from backend.app.analytics.data_contract import Metric, QueryContext, compile_contract_query
from backend.app.analytics.org_config import (
    BigQueryConfigurationError,
    OrganisationNotConfiguredError,
    resolve_table_for_org,
)
from backend.app.services.auth_context import authenticate_chart_data_request
from backend.app.services.bigquery_client import BigQueryDataFrameError, bigquery_client
from backend.app.services.time_bounds import resolve_time_bounds

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def _resolve_table_for_org(org_id: str) -> str:
    try:
        return resolve_table_for_org(org_id)
    except OrganisationNotConfiguredError:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "unknown_org",
                "message": f"No table configured for organisation '{org_id}'",
            },
        )
    except BigQueryConfigurationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _resolve_event_search_context(
    *,
    org_id: str,
    table_name: str,
    start_date: Optional[str],
    end_date: Optional[str],
    event: Optional[str],
    sex: Optional[str],
    age: Optional[str],
    race: Optional[str],
    site_id: Optional[str],
    camera_id: Optional[str],
    track_id: Optional[str],
) -> QueryContext:
    filters: Dict[str, Optional[str]] = {
        "start_date": start_date,
        "end_date": end_date,
    }
    bounds = resolve_time_bounds(filters)

    resolved_events: Optional[List[int]] = None
    if event and event.lower() != "all":
        resolved_events = [1 if event.lower() == "entry" else 0]

    resolved_sex = None
    if sex and sex.lower() != "all":
        normalized_sex = sex.strip().lower()
        if normalized_sex in {"m", "male", "0"}:
            resolved_sex = "M"
        elif normalized_sex in {"f", "female", "1"}:
            resolved_sex = "F"
        elif normalized_sex:
            resolved_sex = normalized_sex.upper()

    resolved_age = None
    if age and age.lower() != "all":
        normalized_age = age.strip().lower()
        age_map = {
            "0": "0-4",
            "1": "5-13",
            "2": "14-25",
            "3": "26-45",
            "4": "46-65",
            "5": "66+",
            "0-4": "0-4",
            "5-13": "5-13",
            "14-25": "14-25",
            "26-45": "26-45",
            "46-65": "46-65",
            "66+": "66+",
        }
        resolved_age = age_map.get(normalized_age)
    resolved_race = race if race and race.lower() != "all" else None

    resolved_track_like = None
    if track_id:
        cleaned_track = track_id.strip()
        if cleaned_track.startswith("#"):
            cleaned_track = cleaned_track[1:].strip()
        if cleaned_track:
            resolved_track_like = f"%{cleaned_track.lower()}%"

    return QueryContext(
        org_id=org_id,
        table_name=table_name,
        start=bounds["start_ts"],
        end=bounds["end_ts"],
        events=resolved_events,
        sexes=[resolved_sex] if resolved_sex else None,
        age_buckets=[resolved_age] if resolved_age else None,
        races=[resolved_race] if resolved_race else None,
        site_ids=[site_id] if site_id else None,
        camera_ids=[camera_id] if camera_id else None,
        track_id_like=resolved_track_like,
    )


@router.get("/search-events")
async def search_events(
    request: Request,
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
    view_token: Optional[str] = None,
    client_id: Optional[str] = None,
):
    """Search BigQuery event logs with pagination."""
    try:
        org_id = authenticate_chart_data_request(request, view_token, client_id)
        table_name = _resolve_table_for_org(org_id)

        logger.debug("Event search params: %s", dict(request.query_params))

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

        logger.debug(
            "Event search filters resolved: %s",
            {
                "start": base_ctx.start,
                "end": base_ctx.end,
                "event": base_ctx.events,
                "sex": base_ctx.sexes,
                "age_bucket": base_ctx.age_buckets,
                "race": base_ctx.races,
                "site_id": base_ctx.site_ids,
                "camera_id": base_ctx.camera_ids,
                "track": track_id,
                "page": page,
                "per_page": per_page,
            },
        )

        summary_plan = compile_contract_query(Metric.EVENT_SUMMARY, base_ctx)
        summary_df = bigquery_client.query_dataframe(
            summary_plan.sql,
            summary_plan.params,
            job_context=f"{table_name}::search_summary",
        )
        total_count = int(summary_df.iloc[0]["total_records"]) if not summary_df.empty else 0
        if total_count == 0:
            return {
                "events": [],
                "total": 0,
                "page": page,
                "per_page": per_page,
                "total_pages": 0,
            }

        offset = max(page - 1, 0) * per_page
        paged_ctx = base_ctx.model_copy(update={"limit": per_page, "offset": offset})
        events_plan = compile_contract_query(Metric.RAW_EVENTS, paged_ctx)
        results_df = bigquery_client.query_dataframe(
            events_plan.sql,
            events_plan.params,
            job_context=f"{table_name}::search_results",
        )

        events: List[Dict[str, Any]] = []
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

        return {
            "events": events,
            "total": total_count,
            "page": page,
            "per_page": per_page,
            "total_pages": (total_count + per_page - 1) // per_page,
        }

    except BigQueryDataFrameError as exc:
        logger.error(
            "Event search failed for %s (job_id=%s): %s", table_name, exc.job_id, exc
        )
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
        logger.error("Event search error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to search events: {exc}") from exc
