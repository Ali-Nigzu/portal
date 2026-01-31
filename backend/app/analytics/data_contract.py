"""Contract queries for event summary and raw event search."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Iterable, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

UTC = timezone.utc


class Metric(str, Enum):
    EVENT_SUMMARY = "event_summary"
    RAW_EVENTS = "raw_events"


EVENT_TABLE_COLUMNS: Tuple[str, ...] = (
    "site_id",
    "cam_id",
    "track_id",
    "event",
    "timestamp",
    "sex",
    "age_bucket",
    "race",
)

SEX_EXPRESSION = (
    "CASE WHEN sex = 0 THEN 'M' WHEN sex = 1 THEN 'F' "
    "WHEN LOWER(CAST(sex AS STRING)) IN ('m', 'male') THEN 'M' "
    "WHEN LOWER(CAST(sex AS STRING)) IN ('f', 'female') THEN 'F' "
    "ELSE 'Unknown' END"
)

TRACK_ID_EXPRESSION = "LOWER(CAST(track_id AS STRING))"

AGE_BUCKET_EXPRESSION = (
    "CASE WHEN age_bucket IS NULL THEN 'Unknown' "
    "WHEN CAST(age_bucket AS STRING) = '0' THEN '0-4' "
    "WHEN CAST(age_bucket AS STRING) = '1' THEN '5-13' "
    "WHEN CAST(age_bucket AS STRING) = '2' THEN '14-25' "
    "WHEN CAST(age_bucket AS STRING) = '3' THEN '26-45' "
    "WHEN CAST(age_bucket AS STRING) = '4' THEN '46-65' "
    "WHEN CAST(age_bucket AS STRING) = '5' THEN '66+' "
    "ELSE CAST(age_bucket AS STRING) END"
)


def _ensure_timezone(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class QueryContext(BaseModel):
    """Context required to build an event query."""

    org_id: str
    table_name: Optional[str] = None
    site_ids: Optional[List[str]] = None
    camera_ids: Optional[List[str]] = None
    sexes: Optional[List[str]] = None
    age_buckets: Optional[List[str]] = None
    races: Optional[List[str]] = None
    events: Optional[List[int]] = None
    track_id_like: Optional[str] = None
    start: Optional[datetime] = Field(default=None)
    end: Optional[datetime] = Field(default=None)
    limit: Optional[int] = Field(default=None, ge=0)
    offset: Optional[int] = Field(default=None, ge=0)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("site_ids", "camera_ids", "sexes", "age_buckets", "races", mode="before")
    @classmethod
    def _normalise_sequence(cls, value: Optional[Iterable[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        return [str(item) for item in value if item is not None]

    @field_validator("events", mode="before")
    @classmethod
    def _normalise_int_sequence(cls, value: Optional[Iterable[int]]) -> Optional[List[int]]:
        if value is None:
            return None
        return [int(item) for item in value if item is not None]

    @model_validator(mode="after")
    def _ensure_bounds(cls, values: "QueryContext") -> "QueryContext":
        if values.start is not None and values.end is not None:
            start_dt = _ensure_timezone(values.start)
            end_dt = _ensure_timezone(values.end)
            if start_dt > end_dt:
                start_dt, end_dt = end_dt, start_dt
            values.start = start_dt
            values.end = end_dt
        return values


@dataclass(frozen=True)
class ContractQuery:
    metric: Metric
    sql: str
    params: Dict[str, object]
    measure_id: str


def _build_event_summary_query(ctx: QueryContext) -> ContractQuery:
    if not ctx.table_name:
        raise ValueError("QueryContext must include table_name for compilation")
    filters, params = _render_filters(ctx)
    sql = (
        "SELECT COUNT(*) AS total_records,"
        " MIN(timestamp) AS min_timestamp,"
        " MAX(timestamp) AS max_timestamp,"
        " COUNTIF(event = 1) AS entrances,"
        " COUNTIF(event = 0) AS exits"
        f" FROM `{ctx.table_name}`"
        " WHERE timestamp BETWEEN TIMESTAMP(@start_ts) AND TIMESTAMP(@end_ts)"
        " AND timestamp <= CURRENT_TIMESTAMP()"
        f"{filters}"
    )
    return ContractQuery(
        metric=Metric.EVENT_SUMMARY,
        sql=sql,
        params=params,
        measure_id="summary",
    )


def _build_raw_events_query(ctx: QueryContext, *, limit: int = 10000) -> ContractQuery:
    if not ctx.table_name:
        raise ValueError("QueryContext must include table_name for compilation")
    filters, params = _render_filters(ctx)
    resolved_limit = ctx.limit if ctx.limit is not None else limit
    resolved_offset = ctx.offset if ctx.offset is not None else 0
    params["limit"] = resolved_limit
    params["offset"] = resolved_offset
    sql = (
        "SELECT site_id, cam_id, track_id, event, timestamp,"
        f" {SEX_EXPRESSION} AS sex,"
        f" {AGE_BUCKET_EXPRESSION} AS age_bucket,"
        " COALESCE(CAST(race AS STRING), 'Unknown') AS race"
        f" FROM `{ctx.table_name}`"
        " WHERE timestamp BETWEEN TIMESTAMP(@start_ts) AND TIMESTAMP(@end_ts)"
        " AND timestamp <= CURRENT_TIMESTAMP()"
        f"{filters}"
        " ORDER BY timestamp DESC"
        " LIMIT @limit OFFSET @offset"
    )
    return ContractQuery(
        metric=Metric.RAW_EVENTS,
        sql=sql,
        params=params,
        measure_id="raw_events",
    )


def _render_filters(ctx: QueryContext) -> Tuple[str, Dict[str, object]]:
    if ctx.start is None or ctx.end is None:
        raise ValueError("QueryContext requires start and end timestamps")
    clauses: List[str] = []
    params: Dict[str, object] = {
        "start_ts": ctx.start,
        "end_ts": ctx.end,
    }
    if ctx.site_ids:
        params["site_ids"] = ctx.site_ids
        clauses.append("CAST(site_id AS STRING) IN UNNEST(@site_ids)")
    if ctx.camera_ids:
        params["camera_ids"] = ctx.camera_ids
        clauses.append("CAST(cam_id AS STRING) IN UNNEST(@camera_ids)")
    if ctx.sexes:
        params["sex_filters"] = ctx.sexes
        clauses.append(f"{SEX_EXPRESSION} IN UNNEST(@sex_filters)")
    if ctx.age_buckets:
        params["age_filters"] = ctx.age_buckets
        clauses.append(f"{AGE_BUCKET_EXPRESSION} IN UNNEST(@age_filters)")
    if ctx.races:
        params["race_filters"] = ctx.races
        clauses.append("COALESCE(CAST(race AS STRING), 'Unknown') IN UNNEST(@race_filters)")
    if ctx.events:
        params["event_filters"] = ctx.events
        clauses.append("event IN UNNEST(@event_filters)")
    if ctx.track_id_like:
        params["track_like"] = ctx.track_id_like
        clauses.append(f"{TRACK_ID_EXPRESSION} LIKE @track_like")
    if not clauses:
        return "", params
    return " AND " + " AND ".join(clauses), params


def compile_contract_query(metric: Metric, ctx: QueryContext) -> ContractQuery:
    """Return the compiled SQL plan for a metric."""

    if metric == Metric.EVENT_SUMMARY:
        return _build_event_summary_query(ctx)
    if metric == Metric.RAW_EVENTS:
        return _build_raw_events_query(ctx)
    raise ValueError(f"Unsupported metric: {metric}")
