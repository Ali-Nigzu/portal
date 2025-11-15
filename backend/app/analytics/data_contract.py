"""Canonical data contract for analytics metrics derived from BigQuery events."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from pydantic import BaseModel, Field, field_validator, model_validator

from .compiler import CompilerContext, SpecCompiler

UTC = timezone.utc


class UnsupportedMetricDimensionCombination(ValueError):
    """Raised when a metric cannot be grouped by the requested dimensions."""


class Metric(str, Enum):
    """Canonical analytics metrics supported by the platform."""

    ACTIVITY = "activity"
    ENTRANCES = "entrances"
    EXITS = "exits"
    OCCUPANCY = "occupancy"
    THROUGHPUT = "throughput"
    AVG_DWELL = "avg_dwell"
    DWELL_P90 = "dwell_p90"
    SESSIONS = "sessions"
    RETENTION_RATE = "retention_rate"
    EVENT_SUMMARY = "event_summary"
    DEMOGRAPHICS = "demographics"
    RAW_EVENTS = "raw_events"


class Dimension(str, Enum):
    """Dimensions that metrics may be grouped by."""

    TIME = "time"
    SITE = "site"
    CAMERA = "camera"
    SEX = "sex"
    AGE_BUCKET = "age_bucket"
    RETENTION_LAG = "retention_lag"


class TimeRangeKey(str, Enum):
    """Canonical relative ranges used throughout the product."""

    LAST_24_HOURS = "last_24_hours"
    LAST_7_DAYS = "last_7_days"
    LAST_30_DAYS = "last_30_days"
    CUSTOM = "custom"


_TIME_RANGE_WINDOWS: Dict[TimeRangeKey, Tuple[timedelta, str]] = {
    TimeRangeKey.LAST_24_HOURS: (timedelta(hours=24), "HOUR"),
    TimeRangeKey.LAST_7_DAYS: (timedelta(days=7), "DAY"),
    TimeRangeKey.LAST_30_DAYS: (timedelta(days=30), "DAY"),
}


EVENT_TABLE_COLUMNS: Sequence[str] = (
    "site_id",
    "cam_id",
    "index",
    "track_id",
    "event",
    "timestamp",
    "sex",
    "age_bucket",
)

UNKNOWN_DIMENSION_VALUE = "Unknown"


def _ensure_timezone(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class QueryContext(BaseModel):
    """Context required to build a metric query."""

    org_id: str
    table_name: Optional[str] = None
    site_ids: Optional[List[str]] = None
    camera_ids: Optional[List[str]] = None
    sexes: Optional[List[str]] = None
    age_buckets: Optional[List[str]] = None
    events: Optional[List[int]] = None
    track_id_like: Optional[str] = None
    time_range: TimeRangeKey = TimeRangeKey.CUSTOM
    start: Optional[datetime] = Field(default=None)
    end: Optional[datetime] = Field(default=None)
    bucket: Optional[str] = None
    limit: Optional[int] = Field(default=None, ge=0)
    offset: Optional[int] = Field(default=None, ge=0)

    class Config:
        arbitrary_types_allowed = True

    @field_validator("site_ids", "camera_ids", "sexes", "age_buckets", mode="before")
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
        if values.time_range != TimeRangeKey.CUSTOM:
            if values.start is None or values.end is None:
                duration, default_bucket = _TIME_RANGE_WINDOWS[values.time_range]
                now = datetime.now(tz=UTC)
                values.end = now
                values.start = now - duration
                if values.bucket is None:
                    values.bucket = default_bucket
        if values.start is not None and values.end is not None:
            start_dt = _ensure_timezone(values.start)
            end_dt = _ensure_timezone(values.end)
            if start_dt > end_dt:
                start_dt, end_dt = end_dt, start_dt
            values.start = start_dt
            values.end = end_dt
        return values

    def resolved_bucket(self, metric: Metric) -> Optional[str]:
        if self.bucket:
            return self.bucket
        if metric == Metric.RETENTION_RATE:
            return "WEEK"
        if self.time_range != TimeRangeKey.CUSTOM:
            _, default_bucket = _TIME_RANGE_WINDOWS[self.time_range]
            return default_bucket
        return None

    def time_window(self, metric: Metric) -> Dict[str, object]:
        bucket = self.resolved_bucket(metric)
        if self.start is None or self.end is None:
            raise ValueError("QueryContext requires start and end timestamps")
        window: Dict[str, object] = {
            "from": self.start.isoformat() if self.start else None,
            "to": self.end.isoformat() if self.end else None,
            "timezone": "UTC",
        }
        if bucket:
            window["bucket"] = bucket
        return window

    def filters(self) -> List[Dict[str, object]]:
        filters: List[Dict[str, object]] = []
        conditions: List[Dict[str, object]] = []
        if self.site_ids:
            conditions.append({"field": "site_id", "op": "in", "value": list(self.site_ids)})
        if self.camera_ids:
            conditions.append({"field": "cam_id", "op": "in", "value": list(self.camera_ids)})
        if self.sexes:
            conditions.append({"field": "sex", "op": "in", "value": list(self.sexes)})
        if self.age_buckets:
            conditions.append({"field": "age_bucket", "op": "in", "value": list(self.age_buckets)})
        if self.events:
            conditions.append({"field": "event", "op": "in", "value": list(self.events)})
        if conditions:
            filters.append({"logic": "AND", "conditions": conditions})
        return filters


@dataclass(frozen=True)
class ContractQuery:
    metric: Metric
    dimensions: Tuple[Dimension, ...]
    sql: str
    params: Dict[str, object]
    measure_id: str


def _metric_measure(metric: Metric) -> Tuple[str, Dict[str, object]]:
    if metric == Metric.ACTIVITY:
        return "activity_total", {"aggregation": "count"}
    if metric == Metric.ENTRANCES:
        return "entrances", {"aggregation": "count", "eventTypes": [1]}
    if metric == Metric.EXITS:
        return "exits", {"aggregation": "count", "eventTypes": [0]}
    if metric == Metric.OCCUPANCY:
        return "occupancy", {"aggregation": "occupancy_recursion"}
    if metric == Metric.THROUGHPUT:
        return "throughput", {"aggregation": "activity_rate"}
    if metric == Metric.AVG_DWELL:
        return "avg_dwell", {"aggregation": "dwell_mean"}
    if metric == Metric.DWELL_P90:
        return "p90_dwell", {"aggregation": "dwell_p90"}
    if metric == Metric.SESSIONS:
        return "sessions", {"aggregation": "sessions"}
    if metric == Metric.RETENTION_RATE:
        return "retention_rate", {"aggregation": "retention_rate"}
    raise UnsupportedMetricDimensionCombination(f"Unsupported metric for ChartSpec measure: {metric}")


def _dimension_entry(dimension: Dimension, *, limit: int = 10) -> Dict[str, object]:
    if dimension == Dimension.TIME:
        return {"id": "timestamp", "column": "timestamp", "sort": "asc"}
    if dimension == Dimension.SITE:
        return {"id": "site_id", "column": "site_id", "limit": limit, "sort": "desc"}
    if dimension == Dimension.CAMERA:
        return {"id": "cam_id", "column": "cam_id", "limit": limit, "sort": "desc"}
    if dimension == Dimension.SEX:
        return {"id": "sex", "column": "sex", "sort": "asc"}
    if dimension == Dimension.AGE_BUCKET:
        return {"id": "age_bucket", "column": "age_bucket", "sort": "asc"}
    if dimension == Dimension.RETENTION_LAG:
        return {"id": "retention_lag", "column": "lag_weeks", "sort": "asc"}
    raise UnsupportedMetricDimensionCombination(f"Unknown dimension: {dimension}")


def _validate_dimensions(metric: Metric, dimensions: Sequence[Dimension]) -> None:
    invalid: bool = False
    if metric == Metric.RETENTION_RATE:
        required = {Dimension.TIME, Dimension.RETENTION_LAG}
        invalid = set(dimensions) != required
    elif metric in {Metric.EVENT_SUMMARY, Metric.DEMOGRAPHICS, Metric.RAW_EVENTS}:
        # handled by bespoke query builders
        invalid = False
    else:
        if Dimension.RETENTION_LAG in dimensions:
            invalid = True
        if metric in {Metric.OCCUPANCY, Metric.THROUGHPUT, Metric.AVG_DWELL, Metric.DWELL_P90, Metric.SESSIONS} and Dimension.TIME not in dimensions:
            invalid = True
    if invalid:
        raise UnsupportedMetricDimensionCombination(
            f"Unsupported dimension combination for {metric.value}: {dimensions}"
        )


def _build_chart_spec(metric: Metric, dimensions: Sequence[Dimension], ctx: QueryContext) -> Dict[str, object]:
    _validate_dimensions(metric, dimensions)
    if metric in {Metric.EVENT_SUMMARY, Metric.DEMOGRAPHICS, Metric.RAW_EVENTS}:
        raise UnsupportedMetricDimensionCombination(
            f"Metric {metric.value} requires bespoke builder"
        )
    measure_id, measure = _metric_measure(metric)
    spec: Dict[str, object] = {
        "id": f"contract::{metric.value}",
        "dataset": "events",
        "chartType": "retention" if metric == Metric.RETENTION_RATE else "composed_time",
        "measures": [{"id": measure_id, **measure}],
        "dimensions": [],
        "splits": [],
        "timeWindow": ctx.time_window(metric),
        "filters": ctx.filters(),
    }
    for dimension in dimensions:
        if dimension == Dimension.TIME:
            entry = _dimension_entry(dimension)
            bucket = ctx.resolved_bucket(metric)
            if bucket:
                entry["bucket"] = bucket
            spec["dimensions"].append(entry)
        else:
            spec.setdefault("splits", []).append(_dimension_entry(dimension))
    if not spec["dimensions"]:
        spec["dimensions"].append(_dimension_entry(Dimension.TIME))
        bucket = ctx.resolved_bucket(metric)
        if bucket:
            spec["dimensions"][0]["bucket"] = bucket
    return spec


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
        f"{filters}"
    )
    return ContractQuery(
        metric=Metric.EVENT_SUMMARY,
        dimensions=(),
        sql=sql,
        params=params,
        measure_id="summary",
    )


def _build_demographics_query(ctx: QueryContext) -> ContractQuery:
    if not ctx.table_name:
        raise ValueError("QueryContext must include table_name for compilation")
    filters, params = _render_filters(ctx)
    sql = (
        "SELECT"
        f" COALESCE(sex, '{UNKNOWN_DIMENSION_VALUE}') AS sex,"
        f" COALESCE(age_bucket, '{UNKNOWN_DIMENSION_VALUE}') AS age_bucket,"
        " COUNT(*) AS count"
        f" FROM `{ctx.table_name}`"
        " WHERE timestamp BETWEEN TIMESTAMP(@start_ts) AND TIMESTAMP(@end_ts)"
        f"{filters}"
        " GROUP BY sex, age_bucket"
    )
    return ContractQuery(
        metric=Metric.DEMOGRAPHICS,
        dimensions=(Dimension.SEX, Dimension.AGE_BUCKET),
        sql=sql,
        params=params,
        measure_id="demographics",
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
        "SELECT track_id, event, timestamp,"
        f" COALESCE(sex, '{UNKNOWN_DIMENSION_VALUE}') AS sex,"
        f" COALESCE(age_bucket, '{UNKNOWN_DIMENSION_VALUE}') AS age_bucket"
        f" FROM `{ctx.table_name}`"
        " WHERE timestamp BETWEEN TIMESTAMP(@start_ts) AND TIMESTAMP(@end_ts)"
        f"{filters}"
        " ORDER BY timestamp DESC"
        " LIMIT @limit OFFSET @offset"
    )
    return ContractQuery(
        metric=Metric.RAW_EVENTS,
        dimensions=(),
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
        clauses.append("site_id IN UNNEST(@site_ids)")
    if ctx.camera_ids:
        params["camera_ids"] = ctx.camera_ids
        clauses.append("cam_id IN UNNEST(@camera_ids)")
    if ctx.sexes:
        params["sex_filters"] = ctx.sexes
        clauses.append(
            f"COALESCE(sex, '{UNKNOWN_DIMENSION_VALUE}') IN UNNEST(@sex_filters)"
        )
    if ctx.age_buckets:
        params["age_filters"] = ctx.age_buckets
        clauses.append(
            f"COALESCE(age_bucket, '{UNKNOWN_DIMENSION_VALUE}') IN UNNEST(@age_filters)"
        )
    if ctx.events:
        params["event_filters"] = ctx.events
        clauses.append("event IN UNNEST(@event_filters)")
    if ctx.track_id_like:
        params["track_like"] = ctx.track_id_like
        clauses.append("track_id LIKE @track_like")
    if not clauses:
        return "", params
    return " AND " + " AND ".join(clauses), params


def compile_contract_query(metric: Metric, dimensions: Sequence[Dimension], ctx: QueryContext) -> ContractQuery:
    """Return the compiled SQL plan for a metric."""

    if metric == Metric.EVENT_SUMMARY:
        return _build_event_summary_query(ctx)
    if metric == Metric.DEMOGRAPHICS:
        return _build_demographics_query(ctx)
    if metric == Metric.RAW_EVENTS:
        return _build_raw_events_query(ctx)
    spec = _build_chart_spec(metric, dimensions, ctx)
    compiler = SpecCompiler()
    if not ctx.table_name:
        raise ValueError("QueryContext must include table_name for compilation")
    compiled = compiler.compile(spec, CompilerContext(table_name=ctx.table_name))
    return ContractQuery(
        metric=metric,
        dimensions=tuple(dimensions),
        sql=compiled.sql,
        params=compiled.params,
        measure_id=spec["measures"][0]["id"],
    )


def build_query(metric: Metric, dims: List[Dimension], ctx: QueryContext) -> str:
    """Public helper returning SQL text for downstream execution."""

    plan = compile_contract_query(metric, dims, ctx)
    return plan.sql

