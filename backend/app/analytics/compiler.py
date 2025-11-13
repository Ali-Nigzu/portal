"""Spec → SQL compiler for analytics ChartSpecs."""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from textwrap import dedent
from typing import Dict, Iterable, List, Tuple

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

def _bucket_expression(bucket: str) -> str:
    if bucket == "RAW":
        return "timestamp"
    if bucket in {"DAY", "WEEK", "MONTH"}:
        return f"TIMESTAMP_TRUNC(timestamp, {bucket})"
    seconds = _BUCKET_SECONDS[bucket]
    return (
        "TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(timestamp), {seconds}) * {seconds})".format(
            seconds=seconds
        )
    )


def _bucket_trunc_expression(bucket: str) -> str:
    if bucket == "5_MIN":
        return "TIMESTAMP_TRUNC(@start_ts, MINUTE, 5)"
    if bucket == "15_MIN":
        return "TIMESTAMP_TRUNC(@start_ts, MINUTE, 15)"
    if bucket == "30_MIN":
        return "TIMESTAMP_TRUNC(@start_ts, MINUTE, 30)"
    if bucket == "HOUR":
        return "TIMESTAMP_TRUNC(@start_ts, HOUR)"
    if bucket == "DAY":
        return "TIMESTAMP_TRUNC(@start_ts, DAY)"
    if bucket == "WEEK":
        return "TIMESTAMP_TRUNC(@start_ts, WEEK)"
    if bucket == "MONTH":
        return "TIMESTAMP_TRUNC(@start_ts, MONTH)"
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
        return "INTERVAL 1 WEEK"
    if bucket == "MONTH":
        return "INTERVAL 1 MONTH"
    raise ValidationError(f"Unsupported bucket for interval: {bucket}")


@dataclass
class CompilerContext:
    """Resolved execution context for a ChartSpec."""

    table_name: str
    timezone: str = "UTC"


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
        self._supported_charts = {"composed_time", "categorical", "single_value"}
        self._time_series_measures = {
            "occupancy_recursion": self._render_occupancy,
            "count": self._render_activity,
            "activity_rate": self._render_activity_rate,
        }

    def compile(self, spec: Dict[str, object], context: CompilerContext) -> CompiledQuery:
        validate_chart_spec(spec)
        chart_type = spec["chartType"]
        if chart_type not in self._supported_charts:
            raise UnsupportedChartError(f"Unsupported chart type: {chart_type}")

        time_window = spec["timeWindow"]
        bucket = time_window.get("bucket", "RAW")
        if bucket not in _BUCKET_SECONDS:
            raise ValidationError(f"Unsupported bucket value: {bucket}")

        params: Dict[str, object] = {
            "start_ts": time_window["from"],
            "end_ts": time_window["to"],
        }

        filters_sql = self._build_filters(spec.get("filters", []), params)
        measures = spec["measures"]
        cte_registry: OrderedDict[str, str] = OrderedDict()
        select_statements: List[str] = []

        base_ctes = [self._render_scoped(context.table_name, filters_sql)]
        if bucket != "RAW":
            base_ctes.append(self._render_calendar(bucket))

        for measure in measures:
            aggregation = measure["aggregation"]
            renderer = self._time_series_measures.get(aggregation)
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
        )
        measure_map = {measure["id"]: measure["aggregation"] for measure in measures}
        return CompiledQuery(sql=sql, params=params, measures=measure_map, bucket=bucket)

    def _assemble_sql(
        self,
        *,
        base_ctes: Iterable[str],
        measure_ctes: Iterable[str],
        select_statements: Iterable[str],
    ) -> str:
        cte_entries = list(base_ctes)
        cte_entries.extend(measure_ctes)
        union_selects = "\nUNION ALL\n".join(select_statements)
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
            ORDER BY bucket_start, measure_id
            """
        )
        return "\n".join(line.rstrip() for line in final_sql.splitlines() if line.strip())

    def _render_scoped(self, table_name: str, filters_sql: str) -> str:
        scoped = dedent(
            f"""
            scoped AS (
                SELECT
                    timestamp,
                    event_type,
                    IFNULL(index, 0) AS event_index,
                    site_id,
                    cam_id
                FROM `{table_name}`
                WHERE timestamp BETWEEN @start_ts AND @end_ts{filters_sql}
            )
            """
        ).strip()
        return scoped

    def _render_calendar(self, bucket: str) -> str:
        if bucket == "RAW":
            raise ValidationError("Calendar requires bucketed time series")
        trunc_expr = _bucket_trunc_expression(bucket)
        interval_expr = _bucket_interval_expression(bucket)
        add_expr = f"TIMESTAMP_ADD(bucket_start, {interval_expr})"
        calendar = dedent(
            f"""
            calendar AS (
                WITH window AS (
                    SELECT
                        @start_ts AS window_start,
                        @end_ts AS window_end,
                        {trunc_expr} AS aligned_start
                )
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
                FROM window,
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
        operator = condition["op"]
        value = condition.get("value")
        param_base = field.replace(".", "_")
        index = sum(1 for key in params if key.startswith(param_base))
        if operator == "equals":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} = @{param_name}"
        if operator == "not_equals":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} != @{param_name}"
        if operator == "in":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} IN UNNEST(@{param_name})"
        if operator == "not_in":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} NOT IN UNNEST(@{param_name})"
        if operator == "contains":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"STRPOS(CAST({field} AS STRING), @{param_name}) > 0"
        if operator == "starts_with":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"STARTS_WITH(CAST({field} AS STRING), @{param_name})"
        if operator == "ends_with":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"ENDS_WITH(CAST({field} AS STRING), @{param_name})"
        if operator == "between" and isinstance(value, list) and len(value) == 2:
            lower_name = f"{param_base}_{index}_lower"
            upper_name = f"{param_base}_{index}_upper"
            params[lower_name] = value[0]
            params[upper_name] = value[1]
            return f"{field} BETWEEN @{lower_name} AND @{upper_name}"
        if operator == "gte":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} >= @{param_name}"
        if operator == "lte":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} <= @{param_name}"
        if operator == "gt":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} > @{param_name}"
        if operator == "lt":
            param_name = f"{param_base}_{index}"
            params[param_name] = value
            return f"{field} < @{param_name}"
        raise ValidationError(f"Unsupported filter operator: {operator}")

    def _render_occupancy(self, *, measure: Dict[str, object], bucket: str, params: Dict[str, object]) -> MeasureCompilation:
        if bucket == "RAW":
            raise ValidationError("occupancy_recursion requires bucketed time series")
        measure_id = measure["id"]
        prefix = f"{measure_id}_occupancy"
        ordered = dedent(
            f"""
            {prefix}_ordered AS (
                SELECT
                    timestamp,
                    event_index,
                    site_id,
                    cam_id,
                    event_type,
                    IF(event_type = 1, 1, -1) AS delta,
                    SUM(IF(event_type = 1, 1, -1)) OVER (
                        PARTITION BY site_id, cam_id
                        ORDER BY timestamp, event_index
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
                    ANY_VALUE(clamped.occupancy ORDER BY clamped.timestamp DESC, clamped.event_index DESC) AS occupancy_end
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
                    event_count AS raw_count
                FROM {prefix}_filled
            )
            """
        ).strip()

        select_sql = (
            f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count FROM {prefix}_series"
        )
        return MeasureCompilation(
            ctes=[ordered, clamped, bucket_bounds, occupancy_buckets, occupancy_filled, series],
            select_sql=select_sql,
        )

    def _render_activity(self, *, measure: Dict[str, object], bucket: str, params: Dict[str, object]) -> MeasureCompilation:
        if bucket == "RAW":
            raise ValidationError("count requires bucketed time series")
        measure_id = measure["id"]
        counts_cte_name, counts_cte_sql = self._activity_counts_cte(measure, params)
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
            f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count FROM {measure_id}_activity_series"
        )
        return MeasureCompilation(ctes=[counts_cte_sql, series], select_sql=select_sql)

    def _render_activity_rate(self, *, measure: Dict[str, object], bucket: str, params: Dict[str, object]) -> MeasureCompilation:
        if bucket == "RAW":
            raise ValidationError("activity_rate requires bucketed time series")
        measure_id = measure["id"]
        counts_cte_name, counts_cte_sql = self._activity_counts_cte(measure, params)
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
            f"SELECT '{measure_id}' AS measure_id, bucket_start, value, coverage, raw_count FROM {measure_id}_activity_rate_series"
        )
        return MeasureCompilation(ctes=[counts_cte_sql, series], select_sql=select_sql)

    def _activity_counts_cte(self, measure: Dict[str, object], params: Dict[str, object]) -> Tuple[str, str]:
        measure_id = measure["id"]
        prefix = f"{measure_id}_activity_counts"
        event_types = measure.get("eventTypes")
        filter_sql = ""
        if event_types:
            param_name = f"{measure_id}_event_types"
            params[param_name] = event_types
            filter_sql = f" AND scoped.event_type IN UNNEST(@{param_name})"
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
        return prefix, counts_cte
