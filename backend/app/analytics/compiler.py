"""Spec → SQL compiler for analytics ChartSpecs."""
from __future__ import annotations

import os
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime
from textwrap import dedent
from typing import Dict, Iterable, List, Tuple
from zoneinfo import ZoneInfo

from .contracts import ValidationError, validate_chart_spec


_BUCKET_SECONDS = {
    "RAW": None,
    "5_MIN": 5 * 60,
    "15_MIN": 15 * 60,
    "30_MIN": 30 * 60,
    "HOUR": 60 * 60,
    "DAY": 24 * 60 * 60,
    "WEEK": 7 * 24 * 60 * 60,
    "MONTH": None,  # handled via TIMESTAMP_TRUNC MONTH
}

_RETENTION_MIN_COHORT = 100
_RETENTION_MAX_COHORTS = {"WEEK": 52, "MONTH": 24}

_BUCKET_ORDER = ["5_MIN", "15_MIN", "30_MIN", "HOUR", "DAY", "WEEK", "MONTH"]
_MAX_CALENDAR_BUCKETS = 4000

# BigQuery reserves WINDOW as a keyword, so we use descriptive aliases instead.
WINDOW_BOUNDS_CTE = "window_bounds"
RETENTION_WINDOW_CTE = "retention_window_bounds"

def _bucket_expression(bucket: str, *, field: str = "timestamp") -> str:
    if bucket == "RAW":
        return field
    if bucket in {"DAY", "WEEK", "MONTH"}:
        return f"TIMESTAMP_TRUNC({field}, {bucket})"
    seconds = _BUCKET_SECONDS[bucket]
    return f"TIMESTAMP_SECONDS(DIV(UNIX_SECONDS({field}), {seconds}) * {seconds})"


def _bucket_trunc_expression(bucket: str) -> str:
    if bucket == "5_MIN":
        seconds = _BUCKET_SECONDS["5_MIN"]
        return f"TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(TIMESTAMP(@start_ts)), {seconds}) * {seconds})"
    if bucket == "15_MIN":
        seconds = _BUCKET_SECONDS["15_MIN"]
        return f"TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(TIMESTAMP(@start_ts)), {seconds}) * {seconds})"
    if bucket == "30_MIN":
        seconds = _BUCKET_SECONDS["30_MIN"]
        return f"TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(TIMESTAMP(@start_ts)), {seconds}) * {seconds})"
    if bucket == "HOUR":
        return "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), HOUR)"
    if bucket == "DAY":
        return "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), DAY)"
    if bucket == "WEEK":
        return "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), WEEK)"
    if bucket == "MONTH":
        return "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), MONTH)"
    raise ValidationError(f"Unsupported bucket for truncation: {bucket}")


def _bucket_interval_expression(bucket: str) -> str:
    if bucket == "5_MIN":
        return "INTERVAL 5 MINUTE"
    if bucket == "15_MIN":
        return "INTERVAL 15 MINUTE"
    if bucket == "30_MIN":
        return "INTERVAL 30 MINUTE"
    if bucket == "HOUR":
        return "INTERVAL 1 HOUR"
    if bucket == "DAY":
        return "INTERVAL 1 DAY"
    if bucket == "WEEK":
        return "INTERVAL 7 DAY"
    if bucket == "MONTH":
        return "INTERVAL 30 DAY"
    raise ValidationError(f"Unsupported bucket for interval: {bucket}")


def _parse_iso8601(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_timestamp_param(value: object, *, fallback: str, timezone: str | None = None) -> str:
    """Return a safe ISO8601 timestamp for query parameters.

    - Valid ISO8601 strings are normalized to include timezone info.
    - Empty/invalid inputs fall back to the provided default to avoid TIMESTAMP("") errors.
    """

    parsed = _parse_iso8601(value)
    if parsed is None:
        return fallback

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(timezone or "UTC"))
    else:
        parsed = parsed.astimezone(ZoneInfo(timezone or "UTC"))
    return parsed.isoformat()


def _resolve_time_params(time_window: Dict[str, object], timezone: str) -> Tuple[str, str, str]:
    """Ensure @start_ts/@end_ts/@now are always valid ISO strings."""

    start_fallback = datetime.fromtimestamp(0, tz=ZoneInfo("UTC")).isoformat()
    start_ts = _normalize_timestamp_param(time_window.get("from"), fallback=start_fallback, timezone=timezone)

    end_fallback = _current_time(timezone, time_window.get("to"))
    end_ts = _normalize_timestamp_param(time_window.get("to"), fallback=end_fallback, timezone=timezone)

    now = _current_time(timezone, end_ts)
    return start_ts, end_ts, now


def _current_time(timezone: str, end_ts: object) -> str:
    tzinfo = ZoneInfo(timezone)
    now_in_tz = datetime.now(tzinfo)
    parsed_end = _parse_iso8601(end_ts)
    if parsed_end is not None:
        if parsed_end.tzinfo is None:
            parsed_end = parsed_end.replace(tzinfo=tzinfo)
        else:
            parsed_end = parsed_end.astimezone(tzinfo)
        now_in_tz = min(now_in_tz, parsed_end)
    return now_in_tz.isoformat()


def _bucket_rank(bucket: str) -> int:
    try:
        return _BUCKET_ORDER.index(bucket)
    except ValueError:
        return len(_BUCKET_ORDER)


def _coarsen_bucket_if_needed(
    *, bucket: str, start: object, end: object, raw_start: object | None = None, raw_end: object | None = None
) -> str:
    """Apply a defensive upper bound on calendar bucket counts.

    If the requested time span would generate more than ``_MAX_CALENDAR_BUCKETS``
    buckets at the given grain, coarsen to the next available bucket size (e.g.
    ``5_MIN`` → ``HOUR`` → ``DAY`` → ``WEEK``). Buckets without a fixed interval
    (``RAW``/``MONTH``) are left unchanged.
    """

    if (raw_start is not None and _parse_iso8601(raw_start) is None) or (
        raw_end is not None and _parse_iso8601(raw_end) is None
    ):
        return bucket

    start_dt = _parse_iso8601(start)
    end_dt = _parse_iso8601(end)
    if not start_dt or not end_dt:
        return bucket

    span_seconds = (end_dt - start_dt).total_seconds()
    if span_seconds <= 0:
        return bucket

    effective = bucket
    while True:
        interval_seconds = _BUCKET_SECONDS.get(effective)
        if interval_seconds is None:
            return effective

        if span_seconds / interval_seconds <= _MAX_CALENDAR_BUCKETS:
            return effective

        next_index = _bucket_rank(effective) + 1
        if next_index >= len(_BUCKET_ORDER):
            return effective
        next_bucket = _BUCKET_ORDER[next_index]
        if _BUCKET_SECONDS.get(next_bucket) is None:
            return effective
        effective = next_bucket


def _retention_cohort_trunc(bucket: str) -> str:
    if bucket == "WEEK":
        return "TIMESTAMP_TRUNC(timestamp, WEEK(MONDAY))"
    if bucket == "MONTH":
        return "TIMESTAMP_TRUNC(timestamp, MONTH)"
    raise ValidationError(f"Unsupported retention bucket: {bucket}")


def _retention_max_lag_expr(bucket: str) -> str:
    if bucket == "WEEK":
        seconds = _BUCKET_SECONDS["WEEK"]
        return (
            f"CAST(DIV(TIMESTAMP_DIFF(window_end, window_start, SECOND) + {seconds} - 1, {seconds}) AS INT64)"
        )
    if bucket == "MONTH":
        return "CAST(DATE_DIFF(DATE(window_end), DATE(window_start), MONTH) AS INT64)"
    raise ValidationError(f"Unsupported retention bucket: {bucket}")


def _retention_lag_expression(bucket: str) -> str:
    if bucket == "WEEK":
        return "CAST(FLOOR(TIMESTAMP_DIFF(later.visit_ts, first.visit_ts, DAY) / 7) AS INT64)"
    if bucket == "MONTH":
        return "CAST(DATE_DIFF(DATE(later.visit_ts), DATE(first.visit_ts), MONTH) AS INT64)"
    raise ValidationError(f"Unsupported retention bucket: {bucket}")


def _event_timestamp_column() -> str:
    """Return the raw event timestamp column name (defaults to ``timestamp``)."""

    return os.getenv("EVENT_TIMESTAMP_COLUMN", "timestamp")


@dataclass
class CompilerContext:
    """Resolved execution context for a ChartSpec."""

    table_name: str
    timezone: str = "UTC"
    event_timestamp_column: str = field(default_factory=_event_timestamp_column)


@dataclass
class CompiledQuery:
    """Represents the SQL output from the compiler."""

    sql: str
    params: Dict[str, object]
    measures: Dict[str, str]
    bucket: str


@dataclass
class MeasureCompilation:
    """Holds the rendered SQL fragments for an individual measure."""

    ctes: List[str]
    select_sql: str


class UnsupportedChartError(ValueError):
    """Raised when the compiler does not yet implement a chart type."""


class UnsupportedMeasureError(ValueError):
    """Raised when a measure aggregation is not implemented."""


class SpecCompiler:
    """Translate validated ChartSpecs into executable BigQuery SQL strings."""

    def __init__(self) -> None:
        self._supported_charts = {"composed_time", "categorical", "single_value", "heatmap", "retention"}
        self._time_series_measures = {
            "occupancy_recursion": self._render_occupancy,
            "count": self._render_activity,
            "activity_rate": self._render_activity_rate,
            "dwell_mean": self._render_dwell,
            "dwell_p90": self._render_dwell,
            "sessions": self._render_dwell,
            "demographic_count": self._render_demographic_count,
        }
        self._retention_measures = {
            "retention_rate": self._render_retention,
        }

    def compile(self, spec: Dict[str, object], context: CompilerContext) -> CompiledQuery:
        validate_chart_spec(spec)
        chart_type = spec["chartType"]
        if chart_type not in self._supported_charts:
            raise UnsupportedChartError(f"Unsupported chart type: {chart_type}")

        if chart_type == "single_value":
            return self._compile_single_value(spec, context)

        if chart_type in {"heatmap", "retention"}:
            return self._compile_retention_chart(spec, context)

        time_window = spec["timeWindow"]
        timezone = time_window.get("timezone", context.timezone)
        bucket = time_window.get("bucket", "RAW") if chart_type == "categorical" else self._auto_bucket(
            preferred=time_window.get("bucket", "RAW"),
            start=time_window.get("from"),
            end=time_window.get("to"),
            chart_type=chart_type,
        )

        use_calendar = False if chart_type == "categorical" else self._should_render_calendar(
            bucket=bucket,
            start=time_window.get("from"),
            end=time_window.get("to"),
            chart_type=chart_type,
        )

        measures = spec["measures"]
        vrm_occupancy_enabled = any(
            (measure.get("options") or {}).get("vrmOccupancyStats") for measure in measures
        )
        occupancy_present = any(
            measure.get("aggregation") == "occupancy_recursion" for measure in measures
        )
        start_ts, end_ts, now = _resolve_time_params(time_window, timezone)
        bucket = _coarsen_bucket_if_needed(
            bucket=bucket,
            start=start_ts,
            end=end_ts,
            raw_start=time_window.get("from"),
            raw_end=time_window.get("to"),
        )
        start_dt = _parse_iso8601(start_ts)
        end_dt = _parse_iso8601(end_ts)
        interval_seconds = _BUCKET_SECONDS.get(bucket)
        excessive_calendar = (
            start_dt
            and end_dt
            and interval_seconds
            and interval_seconds > 0
            and (end_dt - start_dt).total_seconds() / interval_seconds > _MAX_CALENDAR_BUCKETS
        )
        if vrm_occupancy_enabled:
            use_calendar = True
        if occupancy_present:
            use_calendar = True
        if use_calendar and excessive_calendar:
            use_calendar = False

        params: Dict[str, object] = {
            "start_ts": start_ts,
            "end_ts": end_ts,
            "now": now,
        }

        filters_sql = self._build_filters(spec.get("filters", []), params)
        cte_registry: OrderedDict[str, str] = OrderedDict()
        select_statements: List[str] = []

        base_ctes = [
            self._render_scoped(
                context.table_name,
                filters_sql,
                event_timestamp_column=context.event_timestamp_column,
            )
        ]
        if bucket != "RAW" and use_calendar and not excessive_calendar:
            base_ctes.append(
                self._render_calendar(
                    bucket, clamp_to_data=vrm_occupancy_enabled or occupancy_present
                )
            )

        for measure in measures:
            aggregation = measure["aggregation"]
            enriched_measure = measure

            if chart_type == "categorical" and aggregation != "demographic_count":
                renderer = self._render_categorical_measure
                dimension = (spec.get("dimensions") or [{}])[0]
                enriched_measure = {**measure, "dimension": dimension}
            else:
                enriched_measure = (
                    {**measure, "dimension": spec["dimensions"][0]}
                    if aggregation == "demographic_count" and "dimension" not in measure
                    else measure
                )
                renderer = self._time_series_measures.get(aggregation)

            if renderer is None:
                raise UnsupportedMeasureError(aggregation)

            compilation = renderer(
                measure=enriched_measure,
                bucket=bucket,
                params=params,
                use_calendar=use_calendar,
            )
            for fragment in compilation.ctes:
                name = fragment.split(" AS", 1)[0].strip()
                cte_registry[name] = fragment
            select_statements.append(compilation.select_sql)

        order_by = "bucket_start, measure_id"
        if chart_type == "categorical" or any(
            measure.get("aggregation") == "demographic_count" for measure in measures
        ):
            order_by = "category_value, measure_id"

        sql = self._assemble_sql(
            base_ctes=base_ctes,
            measure_ctes=cte_registry.values(),
            select_statements=select_statements,
            order_by=order_by,
        )
        measure_map = {measure["id"]: measure["aggregation"] for measure in measures}
        return CompiledQuery(sql=sql, params=params, measures=measure_map, bucket=bucket)

    def _compile_single_value(
        self, spec: Dict[str, object], context: CompilerContext
    ) -> CompiledQuery:
        time_window = spec["timeWindow"]
        timezone = time_window.get("timezone", context.timezone)
        bucket = self._auto_bucket(
            preferred=time_window.get("bucket", "RAW"),
            start=time_window.get("from"),
            end=time_window.get("to"),
            chart_type=spec["chartType"],
        )
        measures = spec["measures"]
        if not measures:
            raise UnsupportedMeasureError("single_value requires at least one measure")

        use_calendar = self._should_render_calendar(
            bucket=bucket,
            start=time_window.get("from"),
            end=time_window.get("to"),
            chart_type=spec["chartType"],
        )
        if spec["chartType"] == "single_value" and not any(
            measure.get("aggregation") == "occupancy_recursion" for measure in measures
        ):
            use_calendar = False

        params: Dict[str, object] = {
            "start_ts": time_window["from"],
            "end_ts": time_window["to"],
            "now": _current_time(timezone, time_window.get("to")),
        }
        bucket = _coarsen_bucket_if_needed(
            bucket=bucket,
            start=params["start_ts"],
            end=params["end_ts"],
            raw_start=time_window.get("from"),
            raw_end=time_window.get("to"),
        )
        start_dt = _parse_iso8601(params["start_ts"])
        end_dt = _parse_iso8601(params["end_ts"])
        interval_seconds = _BUCKET_SECONDS.get(bucket)
        excessive_calendar = (
            start_dt
            and end_dt
            and interval_seconds
            and interval_seconds > 0
            and (end_dt - start_dt).total_seconds() / interval_seconds > _MAX_CALENDAR_BUCKETS
        )
        if use_calendar and excessive_calendar:
            use_calendar = False

        filters_sql = self._build_filters(spec.get("filters", []), params)
        cte_registry: OrderedDict[str, str] = OrderedDict()
        select_statements: List[str] = []
        base_ctes = [
            self._render_scoped(
                context.table_name,
                filters_sql,
                event_timestamp_column=context.event_timestamp_column,
            )
        ]
        if bucket != "RAW" and use_calendar:
            base_ctes.append(self._render_calendar(bucket))

        for measure in measures:
            compilation = self._render_single_value_measure(
                measure=measure,
                params=params,
                bucket=bucket,
                use_calendar=use_calendar,
            )
            for fragment in compilation.ctes:
                name = fragment.split(" AS", 1)[0].strip()
                cte_registry[name] = fragment
            select_statements.append(compilation.select_sql)

        sql = self._assemble_sql(
            base_ctes=base_ctes,
            measure_ctes=cte_registry.values(),
            select_statements=select_statements,
        )
        measure_map = {measure["id"]: measure["aggregation"] for measure in measures}
        return CompiledQuery(sql=sql, params=params, measures=measure_map, bucket=bucket)

    def _auto_bucket(
        self, *, preferred: str, start: object, end: object, chart_type: str
    ) -> str:
        if preferred not in _BUCKET_SECONDS:
            raise ValidationError(f"Unsupported bucket value: {preferred}")
        if chart_type == "single_value" and preferred == "RAW":
            preferred = "DAY"

        start_dt = _parse_iso8601(start)
        end_dt = _parse_iso8601(end)
        if not start_dt or not end_dt:
            return preferred

        span_seconds = (end_dt - start_dt).total_seconds()
        if span_seconds <= 0:
            return preferred

        if span_seconds <= 2 * 24 * 3600:
            recommended = "5_MIN"
        elif span_seconds <= 14 * 24 * 3600:
            recommended = "HOUR"
        elif span_seconds <= 90 * 24 * 3600:
            recommended = "DAY"
        else:
            recommended = "WEEK"

        if chart_type == "single_value":
            return preferred

        if _bucket_rank(preferred) < _bucket_rank(recommended):
            return preferred
        return recommended

    def _should_render_calendar(
        self, *, bucket: str, start: object, end: object, chart_type: str
    ) -> bool:
        if bucket == "RAW":
            return False

        start_dt = _parse_iso8601(start)
        end_dt = _parse_iso8601(end)
        if not start_dt or not end_dt:
            return True

        span_seconds = (end_dt - start_dt).total_seconds()
        if span_seconds <= 0:
            return True

        if span_seconds <= 200 * 24 * 3600:
            return True
        return False

    def _compile_retention_chart(
        self, spec: Dict[str, object], context: CompilerContext
    ) -> CompiledQuery:
        time_window = spec["timeWindow"]
        timezone = time_window.get("timezone", context.timezone)
        bucket = time_window.get("bucket", "WEEK")
        if bucket not in {"WEEK", "MONTH"}:
            raise ValidationError("Retention charts require WEEK or MONTH bucket")

        params: Dict[str, object] = {
            "start_ts": time_window["from"],
            "end_ts": time_window["to"],
            "now": _current_time(timezone, time_window.get("to")),
        }
        filters_sql = self._build_filters(spec.get("filters", []), params)
        measures = spec["measures"]

        cte_registry: OrderedDict[str, str] = OrderedDict()
        select_statements: List[str] = []
        base_ctes = [
            self._render_scoped(
                context.table_name,
                filters_sql,
                event_timestamp_column=context.event_timestamp_column,
            )
        ]
        base_ctes.extend(self._render_retention_calendar(bucket))

        for measure in measures:
            aggregation = measure["aggregation"]
            renderer = self._retention_measures.get(aggregation)
            if renderer is None:
                raise UnsupportedMeasureError(aggregation)
            compilation = renderer(measure=measure, bucket=bucket, params=params)
            for fragment in compilation.ctes:
                name = fragment.split(" AS", 1)[0].strip()
                cte_registry[name] = fragment
            select_statements.append(compilation.select_sql)

        sql = self._assemble_sql(
            base_ctes=base_ctes,
            measure_ctes=cte_registry.values(),
            select_statements=select_statements,
            order_by="bucket_start, lag_weeks, measure_id",
        )
        measure_map = {measure["id"]: measure["aggregation"] for measure in measures}
        return CompiledQuery(sql=sql, params=params, measures=measure_map, bucket=bucket)

    def _assemble_sql(
        self,
        *,
        base_ctes: Iterable[str],
        measure_ctes: Iterable[str],
        select_statements: Iterable[str],
        order_by: str = "bucket_start, measure_id",
    ) -> str:
        cte_entries = list(base_ctes)
        cte_entries.extend(measure_ctes)

        select_list = list(select_statements)
        needs_occupancy = any("occupancy_min" in stmt.lower() for stmt in select_list)
        normalized_selects = []

        for stmt in select_list:
            if needs_occupancy and "occupancy_min" not in stmt.lower():
                normalized_selects.append(
                    " ".join(
                        [
                            "SELECT measure_id, bucket_start, value, coverage, raw_count,",
                            "CAST(NULL AS FLOAT64) AS occupancy_min, CAST(NULL AS FLOAT64) AS occupancy_max,",
                            "CAST(NULL AS FLOAT64) AS occupancy_avg FROM (",
                            stmt,
                            ")",
                        ]
                    )
                )
            else:
                normalized_selects.append(stmt)

        union_selects = "\nUNION ALL\n".join(normalized_selects)
        final_cte = dedent(
            f"""
            final AS (
                {union_selects}
            )
            """
        ).strip()
        cte_entries.append(final_cte)

        cte_block = ",\n".join(cte_entries)
        final_sql = dedent(
            f"""
            WITH
            {cte_block}
            SELECT *
            FROM final
            ORDER BY {order_by}
            """
        )
        return "\n".join(line.rstrip() for line in final_sql.splitlines() if line.strip())

    def _render_scoped(
        self, table_name: str, filters_sql: str, *, event_timestamp_column: str
    ) -> str:
        """Canonical events CTE over the resolved org table.

        - Base table is resolved via org routing (e.g. `nigzsu.demodata0.client0`).
        - Synthetic index reconstructs ordering with
          ROW_NUMBER() OVER (PARTITION BY site_id, cam_id, track_id ORDER BY timestamp, event DESC, track_id).
        - Demographic columns are selected raw and aliased (Race → race) for consistent downstream usage.
        - "No future" rule enforced with `timestamp < @now` alongside the requested window.
        """
        scoped = dedent(
            f"""
            scoped AS (
                WITH scoped_base AS (
                    SELECT
                        site_id,
                        cam_id,
                        cam_id AS camera_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY site_id, cam_id, track_id
                            ORDER BY {event_timestamp_column}, event DESC, track_id
                        ) AS index,
                        track_id,
                        event,
                        -- Keep event timestamp raw for downstream hour extraction (no truncation).
                        {event_timestamp_column} AS timestamp,
                        CASE
                            WHEN age_bucket IS NULL THEN 'Unknown'
                            ELSE CAST(age_bucket AS STRING)
                        END AS age_bucket,
                        CASE sex WHEN 0 THEN 'Male' WHEN 1 THEN 'Female' ELSE 'Unknown' END AS sex,
                        COALESCE(CAST(Race AS STRING), 'Unknown') AS race
                    FROM `{table_name}`
                    WHERE {event_timestamp_column} BETWEEN TIMESTAMP(@start_ts) AND TIMESTAMP(@end_ts)
                        AND {event_timestamp_column} < TIMESTAMP(@now)
                )
                SELECT *
                FROM scoped_base
                WHERE 1=1{filters_sql}
            )
            """
        ).strip()
        return scoped

    def _render_calendar(self, bucket: str, *, clamp_to_data: bool = False) -> str:
        if bucket == "RAW":
            raise ValidationError("Calendar requires bucketed time series")
        window_start_expr = (
            "GREATEST(TIMESTAMP(@start_ts), COALESCE(min_ts, TIMESTAMP(@start_ts)))"
            if clamp_to_data
            else "TIMESTAMP(@start_ts)"
        )
        trunc_expr = (
            _bucket_expression(bucket, field=window_start_expr)
            if clamp_to_data
            else _bucket_trunc_expression(bucket)
        )
        interval_expr = _bucket_interval_expression(bucket)
        add_expr = f"TIMESTAMP_ADD(bucket_start, {interval_expr})"
        bounds_cte = (
            dedent(
                f"""
                calendar_data_bounds AS (
                    SELECT
                        MIN(timestamp) AS min_ts,
                        MAX(timestamp) AS max_ts
                    FROM scoped
                ),
                {WINDOW_BOUNDS_CTE} AS (
                    SELECT
                        {window_start_expr} AS window_start,
                        LEAST(TIMESTAMP(@end_ts), COALESCE(max_ts, TIMESTAMP(@end_ts))) AS window_end,
                        {trunc_expr} AS aligned_start
                    FROM calendar_data_bounds
                )
                """
            ).strip()
            if clamp_to_data
            else dedent(
                f"""
                {WINDOW_BOUNDS_CTE} AS (
                    SELECT
                        TIMESTAMP(@start_ts) AS window_start,
                        TIMESTAMP(@end_ts) AS window_end,
                        {trunc_expr} AS aligned_start
                )
                """
            ).strip()
        )
        calendar = dedent(
            f"""
            calendar AS (
                WITH {bounds_cte}
                SELECT
                    bucket_start,
                    LEAST({add_expr}, window_end) AS bucket_end,
                    GREATEST(
                        TIMESTAMP_DIFF(LEAST({add_expr}, window_end), bucket_start, SECOND),
                        0
                    ) AS bucket_seconds,
                    GREATEST(
                        TIMESTAMP_DIFF(
                            LEAST({add_expr}, window_end),
                            GREATEST(bucket_start, window_start),
                            SECOND
                        ),
                        0
                    ) AS window_seconds
                FROM {WINDOW_BOUNDS_CTE},
                UNNEST(
                    GENERATE_TIMESTAMP_ARRAY(
                        aligned_start,
                        window_end,
                        {interval_expr}
                    )
                ) AS bucket_start
                WHERE bucket_start < window_end
                    AND window_start < window_end
            )
            """
        ).strip()
        return calendar

    def _build_filters(self, groups: Iterable[Dict[str, object]], params: Dict[str, object]) -> str:
        if not groups:
            return ""

        clauses = [self._compile_group(group, params) for group in groups]
        filtered = [clause for clause in clauses if clause]
        if not filtered:
            return ""
        return "".join(f"\n                AND ({clause})" for clause in filtered)

    def _compile_group(self, group: Dict[str, object], params: Dict[str, object]) -> str:
        logic = group.get("logic", "AND").upper()
        conditions = group.get("conditions", [])
        compiled_conditions: List[str] = []
        for condition in conditions:
            if isinstance(condition, dict) and "logic" in condition:
                nested = self._compile_group(condition, params)
                if nested:
                    compiled_conditions.append(f"({nested})")
            elif isinstance(condition, dict):
                compiled = self._compile_condition(condition, params)
                if compiled:
                    compiled_conditions.append(compiled)
        if not compiled_conditions:
            return ""
        joiner = f" {logic} "
        return joiner.join(compiled_conditions)

    def _compile_condition(self, condition: Dict[str, object], params: Dict[str, object]) -> str:
        field = condition["field"]
        if field == "Race":
            field = "race"
        field_expr = f"CAST({field} AS STRING)" if field in {"sex", "age_bucket", "race"} else field
        operator = condition["op"]
        value = condition.get("value")
        param_base = re.sub(r"[^0-9A-Za-z_]", "_", field)
        index = sum(1 for key in params if key.startswith(param_base))
        if operator == "equals":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} = @{param_name}"
        if operator == "not_equals":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} != @{param_name}"
        if operator == "in":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} IN UNNEST(@{param_name})"
        if operator == "not_in":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} NOT IN UNNEST(@{param_name})"
        if operator == "contains":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"STRPOS(CAST({field_expr} AS STRING), @{param_name}) > 0"
        if operator == "starts_with":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"STARTS_WITH(CAST({field_expr} AS STRING), @{param_name})"
        if operator == "ends_with":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"ENDS_WITH(CAST({field_expr} AS STRING), @{param_name})"
        if operator == "between" and isinstance(value, list) and len(value) == 2:
            lower_name = f"{param_base}_{index}_lower"
            upper_name = f"{param_base}_{index}_upper"
            params[lower_name] = value[0]
            params[upper_name] = value[1]
            return f"{field_expr} BETWEEN @{lower_name} AND @{upper_name}"
        if operator == "gte":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} >= @{param_name}"
        if operator == "lte":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} <= @{param_name}"
        if operator == "gt":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} > @{param_name}"
        if operator == "lt":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field_expr} < @{param_name}"
        raise ValidationError(f"Unsupported filter operator: {operator}")

    def _render_occupancy(
        self,
        *,
        measure: Dict[str, object],
        bucket: str,
        params: Dict[str, object],
        use_calendar: bool = True,
    ) -> MeasureCompilation:
        if bucket == "RAW":
            raise ValidationError("occupancy_recursion requires bucketed time series")
        measure_id = measure["id"]
        prefix = f"{measure_id}_occupancy"
        options = measure.get("options", {}) if isinstance(measure.get("options"), dict) else {}

        if not options.get("vrmOccupancy"):
            bucket_expr = _bucket_expression(bucket)
            interval_expr = _bucket_interval_expression(bucket)
            if use_calendar:
                deltas = dedent(
                    f"""
                    {prefix}_deltas AS (
                        SELECT
                            calendar.bucket_start,
                            calendar.bucket_end,
                            calendar.bucket_seconds,
                            calendar.window_seconds,
                            COALESCE(SUM(CASE WHEN scoped.event = 1 THEN 1 WHEN scoped.event = 0 THEN -1 ELSE 0 END), 0) AS delta,
                            COUNT(scoped.timestamp) AS raw_count
                        FROM calendar
                        LEFT JOIN scoped
                            ON scoped.timestamp >= calendar.bucket_start
                            AND scoped.timestamp < calendar.bucket_end
                        GROUP BY
                            calendar.bucket_start,
                            calendar.bucket_end,
                            calendar.bucket_seconds,
                            calendar.window_seconds
                        ORDER BY calendar.bucket_start
                    )
                    """
                ).strip()
            else:
                deltas = dedent(
                    f"""
                    {prefix}_deltas AS (
                        SELECT
                            {bucket_expr} AS bucket_start,
                            TIMESTAMP_ADD({bucket_expr}, {interval_expr}) AS bucket_end,
                            TIMESTAMP_DIFF(TIMESTAMP_ADD({bucket_expr}, {interval_expr}), {bucket_expr}, SECOND) AS bucket_seconds,
                            GREATEST(
                                TIMESTAMP_DIFF(
                                    LEAST(TIMESTAMP_ADD({bucket_expr}, {interval_expr}), TIMESTAMP(@end_ts)),
                                    GREATEST({bucket_expr}, TIMESTAMP(@start_ts)),
                                    SECOND
                                ),
                                0
                            ) AS window_seconds,
                            COALESCE(SUM(CASE WHEN scoped.event = 1 THEN 1 WHEN scoped.event = 0 THEN -1 ELSE 0 END), 0) AS delta,
                            COUNT(scoped.timestamp) AS raw_count
                        FROM scoped
                        GROUP BY bucket_start
                        ORDER BY bucket_start
                    )
                    """
                ).strip()

            series = dedent(
                f"""
                {prefix}_series AS (
                    SELECT
                        bucket_start,
                        GREATEST(
                            SUM(delta) OVER (
                                ORDER BY bucket_start
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ),
                            0
                        ) AS value,
                        CASE
                            WHEN bucket_seconds = 0 THEN 0.0
                            ELSE SAFE_DIVIDE(window_seconds, bucket_seconds)
                        END AS coverage,
                        COALESCE(raw_count, 0) AS raw_count,
                        GREATEST(
                            SUM(delta) OVER (
                                ORDER BY bucket_start
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ),
                            0
                        ) AS occupancy_min,
                        GREATEST(
                            SUM(delta) OVER (
                                ORDER BY bucket_start
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ),
                            0
                        ) AS occupancy_max,
                        GREATEST(
                            SUM(delta) OVER (
                                ORDER BY bucket_start
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ),
                            0
                        ) AS occupancy_avg
                    FROM {prefix}_deltas
                )
                """
            ).strip()

            select_sql = (
                f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, occupancy_min, occupancy_max, occupancy_avg "
                f"FROM {prefix}_series"
            )

            return MeasureCompilation(ctes=[deltas, series], select_sql=select_sql)

        if options.get("vrmOccupancy"):
            if options.get("vrmOccupancyStats"):
                ordered = dedent(
                    f"""
                    {prefix}_ordered AS (
                        SELECT
                            timestamp,
                            index,
                            site_id,
                            cam_id,
                            event,
                            IF(event = 1, 1, -1) AS delta,
                            SUM(IF(event = 1, 1, -1)) OVER (
                                PARTITION BY site_id, cam_id
                                ORDER BY timestamp, index
                            ) AS running_total
                        FROM scoped
                    )
                    """
                ).strip()
                clamped = dedent(
                    f"""
                    {prefix}_clamped AS (
                        SELECT
                            *,
                            GREATEST(running_total, 0) AS occupancy,
                            running_total < 0 AS seeded_by_exit
                        FROM {prefix}_ordered
                    )
                    """
                ).strip()
                if use_calendar:
                    bucket_bounds = dedent(
                        f"""
                        {prefix}_bucket_bounds AS (
                            SELECT
                                bucket_start,
                                bucket_end,
                                bucket_seconds,
                                window_seconds
                            FROM calendar
                        )
                        """
                    ).strip()
                else:
                    interval_expr = _bucket_interval_expression(bucket)
                    bucket_bounds = dedent(
                        f"""
                        {prefix}_bucket_bounds AS (
                            WITH {WINDOW_BOUNDS_CTE} AS (
                                SELECT
                                    TIMESTAMP(@start_ts) AS window_start,
                                    TIMESTAMP(@end_ts) AS window_end,
                                    {_bucket_trunc_expression(bucket)} AS aligned_start
                            )
                            SELECT
                                bucket_start,
                                LEAST(TIMESTAMP_ADD(bucket_start, {interval_expr}), window_end) AS bucket_end,
                                GREATEST(
                                    TIMESTAMP_DIFF(LEAST(TIMESTAMP_ADD(bucket_start, {interval_expr}), window_end), bucket_start, SECOND),
                                    0
                                ) AS bucket_seconds,
                                GREATEST(
                                    TIMESTAMP_DIFF(
                                        LEAST(TIMESTAMP_ADD(bucket_start, {interval_expr}), window_end),
                                        GREATEST(bucket_start, window_start),
                                        SECOND
                                    ),
                                    0
                                ) AS window_seconds
                            FROM {WINDOW_BOUNDS_CTE},
                            UNNEST(
                                GENERATE_TIMESTAMP_ARRAY(
                                    aligned_start,
                                    window_end,
                                    {interval_expr}
                                )
                            ) AS bucket_start
                            WHERE bucket_start < window_end
                        )
                        """
                    ).strip()
                occupancy_buckets = dedent(
                    f"""
                    {prefix}_buckets AS (
                        SELECT
                            bounds.bucket_start,
                            bounds.bucket_end,
                            bounds.bucket_seconds,
                            bounds.window_seconds,
                            COUNT(clamped.timestamp) AS event_count,
                            LOGICAL_OR(clamped.seeded_by_exit) AS seeded_by_exit,
                            ARRAY_AGG(clamped.occupancy ORDER BY clamped.timestamp DESC, clamped.index DESC)[SAFE_OFFSET(0)] AS occupancy_end
                        FROM {prefix}_bucket_bounds AS bounds
                        LEFT JOIN {prefix}_clamped AS clamped
                            ON clamped.timestamp >= bounds.bucket_start
                            AND clamped.timestamp < bounds.bucket_end
                        GROUP BY bounds.bucket_start, bounds.bucket_end, bounds.bucket_seconds, bounds.window_seconds
                        ORDER BY bounds.bucket_start
                    )
                    """
                ).strip()
                occupancy_filled = dedent(
                    f"""
                    {prefix}_filled AS (
                        SELECT
                            bucket_start,
                            bucket_end,
                            bucket_seconds,
                            window_seconds,
                            event_count,
                            seeded_by_exit,
                            COALESCE(
                                occupancy_end,
                                LAST_VALUE(occupancy_end IGNORE NULLS) OVER (
                                    ORDER BY bucket_start
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                                ),
                                0
                            ) AS value,
                            occupancy_end IS NOT NULL AS has_events
                        FROM {prefix}_buckets
                    )
                    """
                ).strip()
                enriched = dedent(
                    f"""
                    {prefix}_enriched AS (
                        SELECT
                            bucket_start,
                            bucket_end,
                            bucket_seconds,
                            window_seconds,
                            event_count,
                            seeded_by_exit,
                            has_events,
                            value,
                            COALESCE(LAG(value) OVER (ORDER BY bucket_start), 0) AS occupancy_start
                        FROM {prefix}_filled
                    )
                    """
                ).strip()
                events_with_bucket = dedent(
                    f"""
                    {prefix}_events_with_bucket AS (
                        SELECT
                            bounds.bucket_start,
                            bounds.bucket_end,
                            bounds.bucket_seconds,
                            bounds.window_seconds,
                            clamped.timestamp,
                            clamped.index,
                            clamped.occupancy
                        FROM {prefix}_bucket_bounds AS bounds
                        LEFT JOIN {prefix}_clamped AS clamped
                            ON clamped.timestamp >= bounds.bucket_start
                            AND clamped.timestamp < bounds.bucket_end
                    )
                    """
                ).strip()
                samples = dedent(
                    f"""
                    {prefix}_samples AS (
                        SELECT
                            bucket_start,
                            bucket_end,
                            bucket_seconds,
                            window_seconds,
                            occupancy_start AS occupancy,
                            bucket_start AS ts,
                            -1 AS ordering
                        FROM {prefix}_enriched
                        UNION ALL
                        SELECT
                            bucket_start,
                            bucket_end,
                            bucket_seconds,
                            window_seconds,
                            occupancy,
                            timestamp AS ts,
                            index AS ordering
                        FROM {prefix}_events_with_bucket
                        WHERE timestamp IS NOT NULL
                        UNION ALL
                        SELECT
                            bucket_start,
                            bucket_end,
                            bucket_seconds,
                            window_seconds,
                            value AS occupancy,
                            bucket_end AS ts,
                            999999999 AS ordering
                        FROM {prefix}_enriched
                    )
                    """
                ).strip()
                samples_with_next = dedent(
                    f"""
                    {prefix}_samples_with_next AS (
                        SELECT
                            bucket_start,
                            bucket_end,
                            bucket_seconds,
                            window_seconds,
                            occupancy,
                            ts,
                            ordering,
                            GREATEST(
                                0,
                                LEAST(
                                    window_seconds,
                                    TIMESTAMP_DIFF(
                                        COALESCE(
                                            LEAD(ts) OVER (PARTITION BY bucket_start ORDER BY ts, ordering),
                                            bucket_end
                                        ),
                                        ts,
                                        SECOND
                                    )
                                )
                            ) AS duration_seconds
                        FROM {prefix}_samples
                    )
                    """
                ).strip()
                band = dedent(
                    f"""
                    {prefix}_band AS (
                        SELECT
                            bucket_start,
                            bucket_seconds,
                            window_seconds,
                            MIN(occupancy) AS occupancy_min,
                            MAX(occupancy) AS occupancy_max,
                            SUM(occupancy * duration_seconds) / NULLIF(window_seconds, 0) AS occupancy_avg
                        FROM {prefix}_samples_with_next
                        GROUP BY bucket_start, bucket_seconds, window_seconds
                    )
                    """
                ).strip()
                series = dedent(
                    f"""
                    {prefix}_series AS (
                        SELECT
                            enriched.bucket_start,
                            COALESCE(band.occupancy_avg, enriched.value) AS value,
                            COALESCE(band.occupancy_min, enriched.value) AS occupancy_min,
                            COALESCE(band.occupancy_max, enriched.value) AS occupancy_max,
                            COALESCE(band.occupancy_avg, enriched.value) AS occupancy_avg,
                            CASE
                                WHEN enriched.bucket_seconds = 0 THEN 0.0
                                WHEN NOT enriched.has_events THEN 0.0
                                WHEN enriched.seeded_by_exit THEN LEAST(0.5, SAFE_DIVIDE(enriched.window_seconds, enriched.bucket_seconds))
                                ELSE SAFE_DIVIDE(enriched.window_seconds, enriched.bucket_seconds)
                            END AS coverage,
                            enriched.event_count AS raw_count
                        FROM {prefix}_enriched AS enriched
                        LEFT JOIN {prefix}_band AS band
                            ON band.bucket_start = enriched.bucket_start
                    )
                    """
                ).strip()

                select_sql = (
                    f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, occupancy_min, occupancy_max, occupancy_avg FROM {prefix}_series"
                )
                return MeasureCompilation(
                    ctes=[
                        ordered,
                        clamped,
                        bucket_bounds,
                        occupancy_buckets,
                        occupancy_filled,
                        enriched,
                        events_with_bucket,
                        samples,
                        samples_with_next,
                        band,
                        series,
                    ],
                    select_sql=select_sql,
                )

            bucket_expr = _bucket_expression(bucket)
            interval_expr = _bucket_interval_expression(bucket)
            anchor = dedent(
                f"""
                {prefix}_anchor AS (
                    SELECT
                        CASE
                            WHEN TIME(TIMESTAMP(@end_ts)) >= TIME(4, 0, 0) THEN TIMESTAMP_TRUNC(TIMESTAMP(@end_ts), DAY)
                            ELSE TIMESTAMP_SUB(TIMESTAMP_TRUNC(TIMESTAMP(@end_ts), DAY), INTERVAL 1 DAY)
                        END + INTERVAL 4 HOUR AS anchor_ts
                )
                """
            ).strip()
            deltas = dedent(
                f"""
                {prefix}_deltas AS (
                    SELECT
                        {bucket_expr} AS bucket_start,
                        COUNT(*) AS event_count,
                        SUM(IF(event = 1, 1, -1)) AS delta
                    FROM scoped
                    GROUP BY bucket_start
                )
                """
            ).strip()
            if use_calendar:
                bucketed = dedent(
                    f"""
                    {prefix}_bucketed AS (
                        SELECT
                            calendar.bucket_start,
                            calendar.bucket_seconds,
                            calendar.window_seconds,
                            COALESCE(deltas.delta, 0) AS delta,
                            COALESCE(deltas.event_count, 0) AS event_count
                        FROM calendar
                        LEFT JOIN {prefix}_deltas AS deltas
                            ON deltas.bucket_start = calendar.bucket_start
                        ORDER BY calendar.bucket_start
                    )
                    """
                ).strip()
            else:
                bucketed = dedent(
                    f"""
                    {prefix}_bucketed AS (
                        SELECT
                            bucket_start,
                            TIMESTAMP_DIFF(TIMESTAMP_ADD(bucket_start, {interval_expr}), bucket_start, SECOND) AS bucket_seconds,
                            GREATEST(
                                TIMESTAMP_DIFF(
                                    LEAST(TIMESTAMP_ADD(bucket_start, {interval_expr}), TIMESTAMP(@end_ts)),
                                    GREATEST(bucket_start, TIMESTAMP(@start_ts)),
                                    SECOND
                                ),
                                0
                            ) AS window_seconds,
                            COALESCE(deltas.delta, 0) AS delta,
                            COALESCE(deltas.event_count, 0) AS event_count
                        FROM (
                            SELECT DISTINCT {bucket_expr} AS bucket_start
                            FROM scoped
                        )
                        LEFT JOIN {prefix}_deltas AS deltas
                            ON deltas.bucket_start = bucket_start
                        ORDER BY bucket_start
                    )
                    """
                ).strip()

            cumulative = dedent(
                f"""
                {prefix}_cumulative AS (
                    SELECT
                        bucket_start,
                        bucket_seconds,
                        window_seconds,
                        event_count,
                        delta,
                        SUM(delta) OVER (ORDER BY bucket_start) AS running_sum
                    FROM {prefix}_bucketed
                )
                """
            ).strip()
            reflected = dedent(
                f"""
                {prefix}_reflected AS (
                    SELECT
                        cumulative.bucket_start,
                        cumulative.bucket_seconds,
                        cumulative.window_seconds,
                        cumulative.event_count,
                        cumulative.delta,
                        cumulative.running_sum,
                        anchor.anchor_ts,
                        CASE
                            WHEN cumulative.bucket_start < anchor.anchor_ts THEN cumulative.running_sum - LEAST(0, MIN(cumulative.running_sum) OVER (
                                ORDER BY cumulative.bucket_start ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ))
                            ELSE cumulative.running_sum - LEAST(0, MIN(IF(cumulative.bucket_start >= anchor.anchor_ts, cumulative.running_sum, NULL)) OVER (
                                ORDER BY cumulative.bucket_start ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ))
                        END AS value
                    FROM {prefix}_cumulative AS cumulative
                    CROSS JOIN {prefix}_anchor AS anchor
                )
                """
            ).strip()
            series = dedent(
                f"""
                {prefix}_series AS (
                    SELECT
                        bucket_start,
                        value,
                        CASE
                            WHEN bucket_seconds = 0 THEN 0.0
                            WHEN event_count = 0 THEN 0.0
                            ELSE SAFE_DIVIDE(window_seconds, bucket_seconds)
                        END AS coverage,
                        event_count AS raw_count
                    FROM {prefix}_reflected
                )
                """
            ).strip()

            select_sql = (
                f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, "
                "CAST(NULL AS FLOAT64) AS occupancy_min, CAST(NULL AS FLOAT64) AS occupancy_max, CAST(NULL AS FLOAT64) AS occupancy_avg "
                f"FROM {prefix}_series"
            )
            return MeasureCompilation(
                ctes=[anchor, deltas, bucketed, cumulative, reflected, series],
                select_sql=select_sql,
            )
        ordered = dedent(
            f"""
            {prefix}_ordered AS (
                SELECT
                    timestamp,
                    index,
                    site_id,
                    cam_id,
                    event,
                    IF(event = 1, 1, -1) AS delta,
                    SUM(IF(event = 1, 1, -1)) OVER (
                        PARTITION BY site_id, cam_id
                        ORDER BY timestamp, index
                    ) AS running_total
                FROM scoped
            )
            """
        ).strip()
        clamped = dedent(
            f"""
            {prefix}_clamped AS (
                SELECT
                    *,
                    GREATEST(running_total, 0) AS occupancy,
                    running_total < 0 AS seeded_by_exit
                FROM {prefix}_ordered
            )
            """
        ).strip()
        if use_calendar:
            bucket_bounds = dedent(
                f"""
                {prefix}_bucket_bounds AS (
                    SELECT
                        bucket_start,
                        bucket_end,
                        bucket_seconds,
                        window_seconds
                    FROM calendar
                )
                """
            ).strip()
        else:
            interval_expr = _bucket_interval_expression(bucket)
            bucket_bounds = dedent(
                f"""
                {prefix}_bucket_bounds AS (
                    SELECT
                        bucket_start,
                        TIMESTAMP_ADD(bucket_start, {interval_expr}) AS bucket_end,
                        TIMESTAMP_DIFF(TIMESTAMP_ADD(bucket_start, {interval_expr}), bucket_start, SECOND) AS bucket_seconds,
                        GREATEST(
                            TIMESTAMP_DIFF(
                                LEAST(TIMESTAMP_ADD(bucket_start, {interval_expr}), TIMESTAMP(@end_ts)),
                                GREATEST(bucket_start, TIMESTAMP(@start_ts)),
                                SECOND
                            ),
                            0
                        ) AS window_seconds
                    FROM (
                        SELECT DISTINCT {_bucket_expression(bucket)} AS bucket_start
                        FROM scoped
                    )
                )
                """
            ).strip()
        occupancy_buckets = dedent(
            f"""
            {prefix}_buckets AS (
                SELECT
                    bounds.bucket_start,
                    bounds.bucket_end,
                    bounds.bucket_seconds,
                    bounds.window_seconds,
                    COUNT(clamped.timestamp) AS event_count,
                    LOGICAL_OR(clamped.seeded_by_exit) AS seeded_by_exit,
                    ARRAY_AGG(clamped.occupancy ORDER BY clamped.timestamp DESC, clamped.index DESC)[SAFE_OFFSET(0)] AS occupancy_end
                FROM {prefix}_bucket_bounds AS bounds
                LEFT JOIN {prefix}_clamped AS clamped
                    ON clamped.timestamp >= bounds.bucket_start
                    AND clamped.timestamp < bounds.bucket_end
                GROUP BY bounds.bucket_start, bounds.bucket_end, bounds.bucket_seconds, bounds.window_seconds
                ORDER BY bounds.bucket_start
            )
            """
        ).strip()
        occupancy_filled = dedent(
            f"""
            {prefix}_filled AS (
                SELECT
                    bucket_start,
                    bucket_seconds,
                    window_seconds,
                    event_count,
                    seeded_by_exit,
                    COALESCE(
                        occupancy_end,
                        LAST_VALUE(occupancy_end IGNORE NULLS) OVER (
                            ORDER BY bucket_start
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ),
                        0
                    ) AS value,
                    occupancy_end IS NOT NULL AS has_events
                FROM {prefix}_buckets
            )
            """
        ).strip()
        series = dedent(
            f"""
            {prefix}_series AS (
                SELECT
                    bucket_start,
                    value,
                    CASE
                        WHEN bucket_seconds = 0 THEN 0.0
                        WHEN NOT has_events THEN 0.0
                        WHEN seeded_by_exit THEN LEAST(0.5, SAFE_DIVIDE(window_seconds, bucket_seconds))
                        ELSE SAFE_DIVIDE(window_seconds, bucket_seconds)
                    END AS coverage,
                    event_count AS raw_count,
                    value AS occupancy_min,
                    value AS occupancy_max,
                    value AS occupancy_avg
                FROM {prefix}_filled
            )
            """
        ).strip()

        select_sql = (
            f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, "
            "occupancy_min, occupancy_max, occupancy_avg "
            f"FROM {prefix}_series"
        )
        return MeasureCompilation(
            ctes=[ordered, clamped, bucket_bounds, occupancy_buckets, occupancy_filled, series],
            select_sql=select_sql,
        )

    def _render_activity(
        self,
        *,
        measure: Dict[str, object],
        bucket: str,
        params: Dict[str, object],
        use_calendar: bool = True,
    ) -> MeasureCompilation:
        if bucket == "RAW":
            raise ValidationError("count requires bucketed time series")
        measure_id = measure["id"]
        counts_cte_name, counts_cte_sql = self._activity_counts_cte(
            measure, params, use_calendar=use_calendar, bucket=bucket
        )
        series = dedent(
            f"""
            {measure_id}_activity_series AS (
                SELECT
                    bucket_start,
                    event_count AS value,
                    CASE
                        WHEN bucket_seconds = 0 THEN 0.0
                        WHEN event_count = 0 THEN 0.0
                        ELSE SAFE_DIVIDE(window_seconds, bucket_seconds)
                    END AS coverage,
                    event_count AS raw_count
                FROM {counts_cte_name}
            )
            """
        ).strip()
        select_sql = (
            f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, "
            "CAST(NULL AS FLOAT64) AS occupancy_min, CAST(NULL AS FLOAT64) AS occupancy_max, CAST(NULL AS FLOAT64) AS occupancy_avg "
            f"FROM {measure_id}_activity_series"
        )
        return MeasureCompilation(ctes=[counts_cte_sql, series], select_sql=select_sql)

    def _render_activity_rate(
        self,
        *,
        measure: Dict[str, object],
        bucket: str,
        params: Dict[str, object],
        use_calendar: bool = True,
    ) -> MeasureCompilation:
        if bucket == "RAW":
            raise ValidationError("activity_rate requires bucketed time series")
        measure_id = measure["id"]
        counts_cte_name, counts_cte_sql = self._activity_counts_cte(
            measure, params, use_calendar=use_calendar, bucket=bucket
        )
        series = dedent(
            f"""
            {measure_id}_activity_rate_series AS (
                SELECT
                    bucket_start,
                    CASE
                        WHEN window_seconds = 0 THEN NULL
                        ELSE SAFE_DIVIDE(event_count * 60.0, window_seconds)
                    END AS value,
                    CASE
                        WHEN bucket_seconds = 0 THEN 0.0
                        WHEN event_count = 0 THEN 0.0
                        ELSE SAFE_DIVIDE(window_seconds, bucket_seconds)
                    END AS coverage,
                    event_count AS raw_count
                FROM {counts_cte_name}
            )
            """
        ).strip()
        select_sql = (
            f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, "
            "CAST(NULL AS FLOAT64) AS occupancy_min, CAST(NULL AS FLOAT64) AS occupancy_max, CAST(NULL AS FLOAT64) AS occupancy_avg "
            f"FROM {measure_id}_activity_rate_series"
        )
        return MeasureCompilation(ctes=[counts_cte_sql, series], select_sql=select_sql)

    def _render_demographic_count(
        self,
        *,
        measure: Dict[str, object],
        bucket: str,
        params: Dict[str, object],
        use_calendar: bool = True,
    ) -> MeasureCompilation:
        dimension = measure.get("dimension") or {}
        if not isinstance(dimension, dict):
            raise ValidationError("demographic_count requires a dimension descriptor")
        column = dimension.get("column")
        if column == "Race":
            column = "race"
        if not column:
            raise ValidationError("demographic_count requires a dimension column")
        column = str(column)
        if column not in {"timestamp", "age_bucket", "sex", "race"}:
            raise ValidationError(f"Unsupported demographic dimension: {column}")
        bucket_label = dimension.get("bucket")
        if column == "timestamp":
            category_bucket = bucket_label or bucket
            if category_bucket == "HOUR":
                # Demographics hour buckets must surface as integer hours (0-23) for frontend mapping.
                category_expr = "CAST(EXTRACT(HOUR FROM scoped.timestamp) AS INT64)"
            elif category_bucket and category_bucket != "RAW":
                category_expr = _bucket_expression(category_bucket, field="scoped.timestamp")
            else:
                category_expr = "scoped.timestamp"
        else:
            category_expr = f"CAST(scoped.{column} AS STRING)"

        measure_id = measure["id"]
        prefix = f"{measure_id}_demographics"
        aggregation_cte = dedent(
            f"""
            {prefix} AS (
                SELECT
                    {category_expr} AS category_value,
                    COUNT(*) AS value
                FROM scoped
                GROUP BY category_value
            )
            """
        ).strip()

        select_sql = dedent(
            f"""
            SELECT '{measure_id}' AS measure_id, category_value, value,
                CAST(NULL AS FLOAT64) AS coverage,
                CAST(NULL AS FLOAT64) AS raw_count,
                CAST(NULL AS FLOAT64) AS occupancy_min,
                CAST(NULL AS FLOAT64) AS occupancy_max,
                CAST(NULL AS FLOAT64) AS occupancy_avg
            FROM {prefix}
            """
        ).strip()

        return MeasureCompilation(ctes=[aggregation_cte], select_sql=select_sql)

    def _render_categorical_measure(
        self,
        *,
        measure: Dict[str, object],
        bucket: str,
        params: Dict[str, object],
        use_calendar: bool = True,
    ) -> MeasureCompilation:
        dimension = measure.get("dimension") or {}
        if not isinstance(dimension, dict):
            raise ValidationError("categorical charts require a dimension descriptor")
        column = dimension.get("column")
        if column == "Race":
            column = "race"
        if not column:
            raise ValidationError("categorical charts require a dimension column")
        bucket_label = dimension.get("bucket")
        if column == "timestamp":
            category_bucket = bucket_label or bucket
            if category_bucket == "HOUR":
                # Demographics hour buckets must surface as integer hours (0-23) for frontend mapping.
                category_expr = "CAST(EXTRACT(HOUR FROM scoped.timestamp) AS INT64)"
            elif category_bucket and category_bucket != "RAW":
                category_expr = _bucket_expression(category_bucket, field="scoped.timestamp")
            else:
                category_expr = "scoped.timestamp"
        else:
            category_expr = f"CAST(scoped.{column} AS STRING)"

        measure_id = measure["id"]
        prefix = f"{measure_id}_categorical"
        aggregation_cte = dedent(
            f"""
            {prefix} AS (
                SELECT
                    {category_expr} AS category_value,
                    COUNT(*) AS value
                FROM scoped
                GROUP BY category_value
            )
            """
        ).strip()

        select_sql = dedent(
            f"""
            SELECT '{measure_id}' AS measure_id, category_value, value,
                CAST(NULL AS FLOAT64) AS coverage,
                CAST(NULL AS FLOAT64) AS raw_count,
                CAST(NULL AS FLOAT64) AS occupancy_min,
                CAST(NULL AS FLOAT64) AS occupancy_max,
                CAST(NULL AS FLOAT64) AS occupancy_avg
            FROM {prefix}
            """
        ).strip()

        return MeasureCompilation(ctes=[aggregation_cte], select_sql=select_sql)

    def _render_single_value_measure(
        self,
        *,
        measure: Dict[str, object],
        params: Dict[str, object],
        bucket: str,
        use_calendar: bool = True,
    ) -> MeasureCompilation:
        aggregation = measure["aggregation"]
        measure_id = measure["id"]
        bucket_start_expr = "TIMESTAMP(@end_ts)"

        if aggregation == "count":
            event_types = measure.get("eventTypes")
            options = measure.get("options") or {}
            if options.get("metric") == "freshness":
                prefix = f"{measure_id}_freshness"
                cte = dedent(
                    f"""
                    {prefix} AS (
                        SELECT
                            {bucket_start_expr} AS bucket_start,
                            CASE
                                WHEN COUNT(*) = 0 THEN NULL
                                ELSE TIMESTAMP_DIFF(TIMESTAMP(@end_ts), MAX(timestamp), MINUTE)
                            END AS value,
                            1.0 AS coverage,
                            COUNT(*) AS raw_count
                        FROM scoped
                    )
                    """
                ).strip()
                select_sql = (
                    f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, "
                    "CAST(NULL AS FLOAT64) AS occupancy_min, CAST(NULL AS FLOAT64) AS occupancy_max, CAST(NULL AS FLOAT64) AS occupancy_avg "
                    f"FROM {prefix}"
                )
                return MeasureCompilation(ctes=[cte], select_sql=select_sql)

            return self._render_activity(
                measure=measure, bucket=bucket, params=params, use_calendar=use_calendar
            )

        if aggregation == "occupancy_recursion":
            return self._render_occupancy(
                measure=measure, bucket=bucket, params=params, use_calendar=use_calendar
            )

        if aggregation in {"dwell_mean", "dwell_p90", "sessions"}:
            return self._render_dwell(
                measure=measure, bucket=bucket, params=params, use_calendar=use_calendar
            )

        raise UnsupportedMeasureError(aggregation)

    def _activity_counts_cte(
        self,
        measure: Dict[str, object],
        params: Dict[str, object],
        *,
        use_calendar: bool = True,
        bucket: str = "DAY",
    ) -> Tuple[str, str]:
        measure_id = measure["id"]
        prefix = f"{measure_id}_activity_counts"
        event_types = measure.get("eventTypes")
        filter_sql = ""
        filter_condition = ""
        if event_types:
            param_name = f"{measure_id}_event_types"
            params[param_name] = event_types
            filter_condition = f"scoped.event IN UNNEST(@{param_name})"
            filter_sql = f" AND {filter_condition}"

        if use_calendar:
            counts_cte = dedent(
                f"""
                {prefix} AS (
                    SELECT
                        calendar.bucket_start,
                        calendar.bucket_seconds,
                        calendar.window_seconds,
                        COUNT(scoped.timestamp) AS event_count
                    FROM calendar
                    LEFT JOIN scoped
                        ON scoped.timestamp >= calendar.bucket_start
                        AND scoped.timestamp < calendar.bucket_end{filter_sql}
                    GROUP BY calendar.bucket_start, calendar.bucket_seconds, calendar.window_seconds
                    ORDER BY calendar.bucket_start
                )
                """
            ).strip()
        else:
            bucket_expr = _bucket_expression(bucket)
            interval_expr = _bucket_interval_expression(bucket)
            counts_cte = dedent(
                f"""
                {prefix} AS (
                    SELECT
                        {bucket_expr} AS bucket_start,
                        TIMESTAMP_DIFF(TIMESTAMP_ADD({bucket_expr}, {interval_expr}), {bucket_expr}, SECOND) AS bucket_seconds,
                        GREATEST(
                            TIMESTAMP_DIFF(
                                LEAST(TIMESTAMP_ADD({bucket_expr}, {interval_expr}), TIMESTAMP(@end_ts)),
                                GREATEST({bucket_expr}, TIMESTAMP(@start_ts)),
                                SECOND
                            ),
                            0
                        ) AS window_seconds,
                        COUNT(scoped.timestamp) AS event_count
                    FROM scoped
                    WHERE scoped.timestamp BETWEEN TIMESTAMP(@start_ts) AND TIMESTAMP(@end_ts){filter_sql}
                    GROUP BY bucket_start
                    ORDER BY bucket_start
                )
                """
            ).strip()
        return prefix, counts_cte

    def _render_dwell(
        self,
        *,
        measure: Dict[str, object],
        bucket: str,
        params: Dict[str, object],
        use_calendar: bool = True,
    ) -> MeasureCompilation:
        if bucket == "RAW":
            raise ValidationError("dwell metrics require bucketed time series")
        aggregation = measure["aggregation"]
        measure_id = measure["id"]
        prefix = f"{measure_id}_dwell"
        options = measure.get("options", {}) if isinstance(measure.get("options"), dict) else {}

        if options.get("vrmDwellFifo"):
            events = dedent(
                f"""
                {prefix}_events AS (
                    SELECT
                        site_id,
                        cam_id,
                        track_id,
                        timestamp,
                        event,
                        index,
                        SUM(IF(event = 1, 1, 0)) OVER (
                            PARTITION BY site_id, cam_id
                            ORDER BY timestamp, index
                        ) AS entrance_count,
                        SUM(IF(event = 0, 1, 0)) OVER (
                            PARTITION BY site_id, cam_id
                            ORDER BY timestamp, index
                        ) AS exit_count
                    FROM scoped
                )
                """
            ).strip()

            entrances = dedent(
                f"""
                {prefix}_entrances AS (
                    SELECT
                        site_id,
                        cam_id,
                        timestamp AS entrance_ts,
                        ROW_NUMBER() OVER (
                            PARTITION BY site_id, cam_id
                            ORDER BY timestamp, index
                        ) AS entrance_seq
                    FROM scoped
                    WHERE event = 1
                )
                """
            ).strip()

            exits = dedent(
                f"""
                {prefix}_exits AS (
                    SELECT
                        site_id,
                        cam_id,
                        timestamp AS exit_ts,
                        index,
                        entrance_count,
                        exit_count,
                        MIN(entrance_count - exit_count) OVER (
                            PARTITION BY site_id, cam_id
                            ORDER BY timestamp, index
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) AS min_balance,
                        ROW_NUMBER() OVER (
                            PARTITION BY site_id, cam_id
                            ORDER BY timestamp, index
                        ) AS exit_seq,
                        exit_count + LEAST(
                            MIN(entrance_count - exit_count) OVER (
                                PARTITION BY site_id, cam_id
                                ORDER BY timestamp, index
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ),
                            0
                        ) AS matched_seq
                    FROM {prefix}_events
                    WHERE event = 0
                )
                """
            ).strip()

            filtered_exits = dedent(
                f"""
                {prefix}_filtered_exits AS (
                    SELECT
                        site_id,
                        cam_id,
                        exit_ts,
                        matched_seq
                    FROM (
                        SELECT
                            *,
                            LAG(matched_seq, 1, 0) OVER (
                                PARTITION BY site_id, cam_id
                                ORDER BY exit_ts, index
                            ) AS prev_matched_seq
                        FROM {prefix}_exits
                    )
                    WHERE matched_seq > prev_matched_seq
                )
                """
            ).strip()

            sessions = dedent(
                f"""
                {prefix}_sessions AS (
                    SELECT
                        e.site_id,
                        e.cam_id,
                        entrance.entrance_ts,
                        e.exit_ts,
                        TIMESTAMP_DIFF(e.exit_ts, entrance.entrance_ts, SECOND) / 60.0 AS dwell_minutes
                    FROM {prefix}_filtered_exits AS e
                    JOIN {prefix}_entrances AS entrance
                        ON entrance.site_id = e.site_id
                        AND entrance.cam_id = e.cam_id
                        AND entrance.entrance_seq = e.matched_seq
                    WHERE TIMESTAMP_DIFF(e.exit_ts, entrance.entrance_ts, MINUTE) BETWEEN 0 AND 360
                )
                """
            ).strip()
        else:
            partition_fields = "site_id, cam_id, track_id"
            join_track_id = "AND e.track_id = x.track_id"

            entrances = dedent(
                f"""
                {prefix}_entrances AS (
                    SELECT
                        site_id,
                        cam_id,
                        track_id,
                        timestamp AS entrance_ts,
                        ROW_NUMBER() OVER (
                            PARTITION BY {partition_fields}
                            ORDER BY timestamp, index
                        ) AS rn
                    FROM scoped
                    WHERE event = 1
                )
                """
            ).strip()

            exits = dedent(
                f"""
                {prefix}_exits AS (
                    SELECT
                        site_id,
                        cam_id,
                        track_id,
                        timestamp AS exit_ts,
                        ROW_NUMBER() OVER (
                            PARTITION BY {partition_fields}
                            ORDER BY timestamp, index
                        ) AS rn
                    FROM scoped
                    WHERE event = 0
                )
                """
            ).strip()

            sessions = dedent(
                f"""
                {prefix}_sessions AS (
                    SELECT
                        e.site_id,
                        e.cam_id,
                        e.track_id,
                        e.entrance_ts,
                        x.exit_ts,
                        TIMESTAMP_DIFF(x.exit_ts, e.entrance_ts, SECOND) / 60.0 AS dwell_minutes
                    FROM {prefix}_entrances AS e
                    LEFT JOIN {prefix}_exits AS x
                        ON e.site_id = x.site_id
                        AND e.cam_id = x.cam_id
                        AND e.rn = x.rn
                        {join_track_id}
                    WHERE x.exit_ts IS NOT NULL
                        AND TIMESTAMP_DIFF(x.exit_ts, e.entrance_ts, MINUTE) BETWEEN 0 AND 360
                )
                """
            ).strip()

        if use_calendar:
            bucketed = dedent(
                f"""
                {prefix}_bucketed AS (
                    SELECT
                        calendar.bucket_start,
                        calendar.bucket_seconds,
                        calendar.window_seconds,
                        COUNT(sessions.dwell_minutes) AS session_count,
                        AVG(sessions.dwell_minutes) AS dwell_mean,
                        APPROX_QUANTILES(sessions.dwell_minutes, 101)[OFFSET(90)] AS dwell_p90
                    FROM calendar
                    LEFT JOIN {prefix}_sessions AS sessions
                        ON sessions.entrance_ts >= calendar.bucket_start
                        AND sessions.entrance_ts < calendar.bucket_end
                    GROUP BY calendar.bucket_start, calendar.bucket_seconds, calendar.window_seconds
                    ORDER BY calendar.bucket_start
                )
                """
            ).strip()
        else:
            interval_expr = _bucket_interval_expression(bucket)
            bucket_expr = _bucket_expression(bucket, field="entrance_ts")
            bucketed = dedent(
                f"""
                {prefix}_bucketed AS (
                    SELECT
                        bucket_start,
                        TIMESTAMP_DIFF(TIMESTAMP_ADD(bucket_start, {interval_expr}), bucket_start, SECOND) AS bucket_seconds,
                        GREATEST(
                            TIMESTAMP_DIFF(
                                LEAST(TIMESTAMP_ADD(bucket_start, {interval_expr}), TIMESTAMP(@end_ts)),
                                GREATEST(bucket_start, TIMESTAMP(@start_ts)),
                                SECOND
                            ),
                            0
                        ) AS window_seconds,
                        COUNT(dwell_minutes) AS session_count,
                        AVG(dwell_minutes) AS dwell_mean,
                        APPROX_QUANTILES(dwell_minutes, 101)[OFFSET(90)] AS dwell_p90
                    FROM (
                        SELECT {bucket_expr} AS bucket_start, dwell_minutes
                        FROM {prefix}_sessions AS sessions
                    )
                    GROUP BY bucket_start
                    ORDER BY bucket_start
                )
                """
            ).strip()

        value_column = {
            "dwell_mean": "dwell_mean",
            "dwell_p90": "dwell_p90",
            "sessions": "session_count",
        }[aggregation]

        value_expression = (
            f"CASE WHEN session_count = 0 THEN NULL ELSE {value_column} END"
            if aggregation in {"dwell_mean", "dwell_p90"}
            else "session_count"
        )

        series = dedent(
            f"""
            {prefix}_series AS (
                SELECT
                    bucket_start,
                    {value_expression} AS value,
                    CASE
                        WHEN bucket_seconds = 0 THEN 0.0
                        WHEN session_count = 0 THEN 0.0
                        ELSE SAFE_DIVIDE(window_seconds, bucket_seconds)
                    END AS coverage,
                    session_count AS raw_count
                FROM {prefix}_bucketed
            )
            """
        ).strip()

        select_sql = (
            f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count, "
            "CAST(NULL AS FLOAT64) AS occupancy_min, CAST(NULL AS FLOAT64) AS occupancy_max, CAST(NULL AS FLOAT64) AS occupancy_avg "
            f"FROM {prefix}_series"
        )
        ctes = [entrances, exits, sessions, bucketed, series]
        if options.get("vrmDwellFifo"):
            ctes = [events, entrances, exits, filtered_exits, sessions, bucketed, series]

        return MeasureCompilation(
            ctes=ctes,
            select_sql=select_sql,
        )

    def _render_retention_calendar(self, bucket: str) -> List[str]:
        if bucket == "WEEK":
            trunc_expr = "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), WEEK(MONDAY))"
        elif bucket == "MONTH":
            trunc_expr = "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), MONTH)"
        else:
            raise ValidationError(f"Unsupported retention bucket: {bucket}")
        interval_expr = _bucket_interval_expression(bucket)
        max_lag_expr = _retention_max_lag_expr(bucket)
        max_cohort_interval = (
            f"INTERVAL {_RETENTION_MAX_COHORTS[bucket] * 7} DAY"
            if bucket == "WEEK"
            else f"INTERVAL {_RETENTION_MAX_COHORTS[bucket] * 30} DAY"
        )
        window_bounds = dedent(
            f"""
            {RETENTION_WINDOW_CTE} AS (
                SELECT
                    window_start,
                    window_end,
                    {max_lag_expr} AS max_lag
                FROM (
                    SELECT
                        {trunc_expr} AS window_start,
                        TIMESTAMP(@end_ts) AS window_end
                )
            )
            """
        ).strip()
        calendar = dedent(
            f"""
            retention_calendar AS (
                SELECT
                    cohort_start AS bucket_start,
                    lag_index AS lag_weeks,
                    bounds.window_end
                FROM {RETENTION_WINDOW_CTE} AS bounds,
                UNNEST(
                    GENERATE_TIMESTAMP_ARRAY(
                        bounds.window_start,
                        bounds.window_end,
                        {interval_expr}
                    )
                    ) AS cohort_start,
                    UNNEST(GENERATE_ARRAY(0, GREATEST(bounds.max_lag, 0))) AS lag_index
                WHERE cohort_start < bounds.window_end
                    AND cohort_start >= TIMESTAMP_SUB(bounds.window_end, {max_cohort_interval})
            )
            """
        ).strip()
        return [window_bounds, calendar]

    def _render_retention(
        self, *, measure: Dict[str, object], bucket: str, params: Dict[str, object]
    ) -> MeasureCompilation:
        measure_id = measure["id"]
        prefix = f"{measure_id}_retention"
        cohort_trunc = _retention_cohort_trunc(bucket)
        lag_expression = _retention_lag_expression(bucket)

        entrances = dedent(
            f"""
            {prefix}_entrances AS (
                SELECT
                    site_id,
                    track_id,
                    timestamp,
                    LAG(timestamp) OVER (
                        PARTITION BY site_id, track_id
                        ORDER BY timestamp, index
                    ) AS prev_timestamp
                FROM scoped
                WHERE event = 1
            )
            """
        ).strip()

        visits = dedent(
            f"""
            {prefix}_visits AS (
                SELECT
                    site_id,
                    track_id,
                    timestamp AS visit_ts,
                    {cohort_trunc} AS cohort_week
                FROM {prefix}_entrances
                WHERE prev_timestamp IS NULL
                    OR TIMESTAMP_DIFF(timestamp, prev_timestamp, MINUTE) >= 30
            )
            """
        ).strip()

        cohort_sizes = dedent(
            f"""
            {prefix}_cohort_sizes AS (
                SELECT
                    cohort_week,
                    COUNT(DISTINCT track_id) AS cohort_size
                FROM {prefix}_visits
                GROUP BY cohort_week
            )
            """
        ).strip()

        returns = dedent(
            f"""
            {prefix}_returns AS (
                SELECT
                    first.cohort_week,
                    {lag_expression} AS lag_weeks,
                    later.track_id
                FROM {prefix}_visits AS first
                JOIN {prefix}_visits AS later
                    ON first.site_id = later.site_id
                    AND first.track_id = later.track_id
                    AND later.visit_ts >= first.visit_ts
            )
            """
        ).strip()

        counts = dedent(
            f"""
            {prefix}_counts AS (
                SELECT
                    cohort_week,
                    lag_weeks,
                    COUNT(DISTINCT track_id) AS returning
                FROM {prefix}_returns
                WHERE lag_weeks BETWEEN 0 AND 52
                GROUP BY cohort_week, lag_weeks
            )
            """
        ).strip()

        matrix = dedent(
            f"""
            {prefix}_matrix AS (
                SELECT
                    calendar.bucket_start,
                    calendar.lag_weeks,
                    IFNULL(counts.returning, 0) AS returning,
                    IFNULL(sizes.cohort_size, 0) AS cohort_size
                FROM retention_calendar AS calendar
                LEFT JOIN {prefix}_counts AS counts
                    ON counts.cohort_week = calendar.bucket_start
                    AND counts.lag_weeks = calendar.lag_weeks
                LEFT JOIN {prefix}_cohort_sizes AS sizes
                    ON sizes.cohort_week = calendar.bucket_start
            )
            """
        ).strip()

        series = dedent(
            f"""
            {prefix}_series AS (
                SELECT
                    bucket_start,
                    lag_weeks,
                    CASE
                        WHEN cohort_size = 0 THEN NULL
                        ELSE SAFE_DIVIDE(returning, cohort_size)
                    END AS value,
                    CASE
                        WHEN cohort_size = 0 THEN 0.0
                        ELSE LEAST(SAFE_DIVIDE(cohort_size, {_RETENTION_MIN_COHORT}), 1.0)
                    END AS coverage,
                    returning AS raw_count
                FROM {prefix}_matrix
            )
            """
        ).strip()

        select_sql = (
            f"SELECT '{measure_id}' AS measure_id, bucket_start, lag_weeks, value, coverage, raw_count FROM {prefix}_series"
        )

        return MeasureCompilation(
            ctes=[entrances, visits, cohort_sizes, returns, counts, matrix, series],
            select_sql=select_sql,
        )
