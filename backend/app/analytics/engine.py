"""Analytics execution engine wiring the compiler, BigQuery, and caching."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from numbers import Number
from typing import Any, Dict, Iterable, List, Optional

from .dashboard_catalogue import get_dashboard_spec

import pandas as pd

from ..bigquery_client import BigQueryDataFrameError
from .cache import SpecCache
from .compiler import (
    CompiledQuery,
    CompilerContext,
    SpecCompiler,
    _parse_iso8601,
    _resolve_time_params,
    _safe_bucket_count,
)
from .contracts import (
    ValidationError as ContractValidationError,
    validate_chart_result,
)
from .data_contract import ALL_TIME_START
from .hashing import build_cache_key
from .router import TableRouter


_GEOMETRY_MAP = {
    "occupancy_recursion": "area",
    "count": "column",
    "activity_rate": "line",
    "dwell_mean": "line",
    "dwell_p90": "line",
    "sessions": "column",
    "demographic_count": "bar",
    "retention_rate": "heatmap",
}

_AXIS_MAP = {
    "occupancy_recursion": "Y1",
    "count": "Y2",
    "activity_rate": "Y2",
    "dwell_mean": "Y1",
    "dwell_p90": "Y1",
    "sessions": "Y2",
}

_UNIT_MAP = {
    "occupancy_recursion": "people",
    "count": "events",
    "activity_rate": "events/min",
    "dwell_mean": "minutes",
    "dwell_p90": "minutes",
    "sessions": "count",
    "demographic_count": "events",
    "retention_rate": "percentage",
}


logger = logging.getLogger(__name__)
DEBUG_SQL_ENABLED = os.getenv("ANALYTICS_DEBUG_SQL", "").lower() in {"1", "true", "yes"}
_DEBUG_SQL_PREFIXES = ("dashboard.live_flow", "dashboard.kpi.vrm.")

_KPI_BUNDLE_MAP: Dict[str, tuple[str, str]] = {
    "dashboard.kpi.activity_today": ("dashboard.kpi.site_flow_bundle", "activity_total"),
    "dashboard.kpi.entrances_today": ("dashboard.kpi.site_flow_bundle", "entrances"),
    "dashboard.kpi.exits_today": ("dashboard.kpi.site_flow_bundle", "exits"),
    "dashboard.kpi.avg_dwell_today": ("dashboard.kpi.site_flow_bundle", "avg_dwell"),
}
def _label_for_series(measure_id: str, aggregation: str) -> str:
    if measure_id:
        return measure_id.replace("_", " ").title()
    return aggregation.replace("_", " ").title()


def _to_iso(value: Any) -> str:
    if isinstance(value, pd.Timestamp):
        ts = value.tz_convert("UTC") if value.tzinfo else value.tz_localize("UTC")
        return ts.isoformat().replace("+00:00", "Z")
    if hasattr(value, "isoformat"):
        text = value.isoformat()
        if text.endswith("+00:00"):
            return text.replace("+00:00", "Z")
        return text
    return str(value)


def _coerce_number(value: Any, cast=float) -> Optional[float]:
    """Return a numeric value or ``None`` for missing/NA placeholders."""

    try:
        if value is None or (hasattr(pd, "isna") and pd.isna(value)):
            return None
    except Exception:
        # Fall back to a best-effort conversion for unusual objects
        if value is None:
            return None

    try:
        coerced = cast(value)
    except Exception:
        return None
    return coerced


def _categorical_bucket_sort_key(bucket_key: str) -> tuple[int, Any]:
    """Return a deterministic sort key for categorical buckets.

    Numeric buckets (including numeric strings) are ordered before non-numeric
    buckets and sorted by numeric value. Non-numeric buckets fall back to a
    lexical order.
    """

    try:
        numeric_value = float(bucket_key)
    except (TypeError, ValueError):
        return (1, str(bucket_key))
    return (0, numeric_value)


def _detect_surges(measure_id: str, points: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    values = [float(point["y"]) for point in points if point.get("y") is not None]
    if len(values) < 2:
        return []
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    stddev = variance ** 0.5
    if stddev == 0:
        threshold = mean * 1.1
    else:
        threshold = mean + stddev
    surges = []
    for point in points:
        value = point.get("y")
        if value is None:
            continue
        if float(value) >= threshold:
            surges.append({"measure": measure_id, "x": point["x"], "value": float(value)})
    return surges


def _filter_single_value_measure(result: Dict[str, Any], measure_id: str) -> Dict[str, Any]:
    """Return a ChartResult containing only the requested single-value measure."""

    filtered_series = []
    for series in result.get("series", []):
        if series.get("id") != measure_id:
            continue
        normalised_series = {**series, "geometry": "metric"}
        normalised_series.pop("axis", None)
        if normalised_series.get("data"):
            for point in normalised_series["data"]:
                if "y" in point and "value" not in point:
                    point["value"] = point["y"]
        filtered_series.append(normalised_series)

    filtered_meta = dict(result.get("meta", {}) or {})
    summary = dict(filtered_meta.get("summary", {}) or {})
    measures = summary.get("measures")
    if measures is not None:
        summary["measures"] = [m for m in measures if m == measure_id]
    filtered_meta["summary"] = summary

    return {**result, "chartType": "single_value", "series": filtered_series, "meta": filtered_meta}


@dataclass
class AnalyticsEngine:
    """High-level orchestration for executing ChartSpecs."""

    table_router: TableRouter
    bigquery_client: Any
    cache: SpecCache
    compiler: SpecCompiler = field(default_factory=SpecCompiler)

    def execute(
        self,
        spec: Dict[str, Any],
        *,
        organisation: str,
        bypass_cache: bool = False,
        cache_ttl: Optional[int] = None,
    ) -> Dict[str, Any]:
        table_name = self.table_router.resolve(organisation)
        try:
            event_timestamp_column = self.table_router.resolve_event_timestamp_column(
                organisation,
                table_name=table_name,
                schema_loader=getattr(self.bigquery_client, "get_table_schema", None),
            )
        except ValueError as exc:
            logger.error(
                "analytics.run.timestamp_resolution_failed",
                extra={
                    "spec_id": spec.get("id"),
                    "org": organisation,
                    "table": table_name,
                },
            )
            raise ContractValidationError(str(exc)) from exc
        logger.info(
            "analytics.run.resolved_table org=%s table=%s",
            organisation,
            table_name,
            extra={"spec_id": spec.get("id"), "org": organisation, "table": table_name},
        )
        logger.info(
            "analytics.run.resolved_timestamp_column org=%s column=%s",
            organisation,
            event_timestamp_column,
            extra={
                "spec_id": spec.get("id"),
                "org": organisation,
                "timestamp_column": event_timestamp_column,
            },
        )
        spec, early_result = self._rewrite_all_time_window_if_needed(
            spec,
            table_name=table_name,
            event_timestamp_column=event_timestamp_column,
        )
        cache_key = build_cache_key(spec, table_name=table_name)
        if not bypass_cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached
        if early_result is not None:
            if not bypass_cache:
                self.cache.set(cache_key, early_result, ttl=cache_ttl)
            return early_result

        delegated = self._maybe_delegate_kpi_bundle(
            spec,
            organisation=organisation,
            cache_key=cache_key,
            bypass_cache=bypass_cache,
            cache_ttl=cache_ttl,
        )
        if delegated is not None:
            return delegated

        compiled = self.compiler.compile(
            spec,
            CompilerContext(
                table_name=table_name, event_timestamp_column=event_timestamp_column
            ),
        )
        spec_id = spec.get("id", "") if isinstance(spec, dict) else ""
        if spec_id == "dashboard.live_flow":
            bucket_count = _safe_bucket_count(
                compiled.bucket, spec.get("timeWindow", {}).get("from"), spec.get("timeWindow", {}).get("to")
            )
            logger.info(
                "analytics.run.debug_live_flow",
                extra={
                    "spec_id": spec_id,
                    "bucket": compiled.bucket,
                    "time_window": spec.get("timeWindow"),
                    "bucket_count": bucket_count,
                },
            )
        if DEBUG_SQL_ENABLED and any(spec_id.startswith(prefix) for prefix in _DEBUG_SQL_PREFIXES):
            logger.info(
                "analytics.run.debug_sql",
                extra={
                    "spec_id": spec_id,
                    "time_window": spec.get("timeWindow"),
                    "bucket": getattr(compiled, "bucket", None),
                    "sql": compiled.sql,
                },
            )
        try:
            frame = self.bigquery_client.query_dataframe(
                compiled.sql,
                compiled.params,
                job_context=spec.get("id"),
            )
        except BigQueryDataFrameError:
            logger.error(
                "analytics.run.bigquery_error",
                extra={
                    "spec_id": spec.get("id"),
                    "org": organisation,
                    "table": table_name,
                    "sql": compiled.sql,
                },
            )
            raise
        result = self._normalise(spec, compiled, frame)
        validate_chart_result(result)
        self.cache.set(cache_key, result, ttl=cache_ttl)
        return result

    def _rewrite_all_time_window_if_needed(
        self,
        spec: Dict[str, Any],
        *,
        table_name: str,
        event_timestamp_column: str,
    ) -> tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
        spec_id = spec.get("id", "") if isinstance(spec, dict) else ""
        if spec_id != "dashboard.live_flow":
            return spec, None
        time_window = spec.get("timeWindow") or {}
        start_value = time_window.get("from")
        if not self._is_epoch_sentinel(start_value):
            return spec, None
        bounds = self._resolve_data_bounds(
            spec,
            table_name=table_name,
            event_timestamp_column=event_timestamp_column,
        )
        if bounds is None:
            empty_result = self._empty_live_flow_result(
                spec,
                table_name=table_name,
                event_timestamp_column=event_timestamp_column,
            )
            return spec, empty_result
        min_ts, max_ts = bounds
        next_window = dict(time_window)
        next_window["from"] = min_ts
        next_window["to"] = max_ts
        spec["timeWindow"] = next_window
        return spec, None

    @staticmethod
    def _is_epoch_sentinel(value: object) -> bool:
        parsed = _parse_iso8601(value)
        if parsed is None:
            return False
        return parsed <= ALL_TIME_START

    def _resolve_data_bounds(
        self,
        spec: Dict[str, Any],
        *,
        table_name: str,
        event_timestamp_column: str,
    ) -> Optional[tuple[str, str]]:
        time_window = spec.get("timeWindow") or {}
        timezone = time_window.get("timezone", "UTC")
        start_ts, end_ts, now = _resolve_time_params(time_window, timezone)
        params: Dict[str, object] = {
            "start_ts": start_ts,
            "end_ts": end_ts,
            "now": now,
        }
        filters_sql = self.compiler._build_filters(spec.get("filters", []), params)
        scoped_cte = self.compiler._render_scoped(
            table_name,
            filters_sql,
            event_timestamp_column=event_timestamp_column,
        )
        sql = "\n".join(
            [
                "WITH",
                scoped_cte,
                "SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts",
                "FROM scoped",
            ]
        )
        frame = self.bigquery_client.query_dataframe(
            sql,
            params,
            job_context=f"{spec.get('id')}::bounds",
        )
        if frame.empty:
            return None
        record = frame.iloc[0]
        min_ts = record.get("min_ts")
        max_ts = record.get("max_ts")
        if min_ts is None or max_ts is None:
            return None
        return _to_iso(min_ts), _to_iso(max_ts)

    def _empty_live_flow_result(
        self,
        spec: Dict[str, Any],
        *,
        table_name: str,
        event_timestamp_column: str,
    ) -> Dict[str, Any]:
        compiled = self.compiler.compile(
            spec,
            CompilerContext(
                table_name=table_name, event_timestamp_column=event_timestamp_column
            ),
        )
        empty_frame = pd.DataFrame(
            columns=[
                "measure_id",
                "bucket_start",
                "value",
                "coverage",
                "raw_count",
                "occupancy_min",
                "occupancy_max",
                "occupancy_avg",
            ]
        )
        result = self._normalise(spec, compiled, empty_frame)
        validate_chart_result(result)
        return result

    def _maybe_delegate_kpi_bundle(
        self,
        spec: Dict[str, Any],
        *,
        organisation: str,
        cache_key: str,
        bypass_cache: bool,
        cache_ttl: Optional[int],
    ) -> Optional[Dict[str, Any]]:
        mapping = _KPI_BUNDLE_MAP.get(spec.get("id"))
        if not mapping:
            return None
        if len(spec.get("measures", [])) != 1:
            return None

        bundle_spec_id, measure_id = mapping
        if spec.get("id") == bundle_spec_id:
            return None

        bundle_spec = get_dashboard_spec(bundle_spec_id)
        if spec.get("timeWindow"):
            bundle_spec["timeWindow"] = spec["timeWindow"]
        if spec.get("dimensions"):
            bundle_spec["dimensions"] = spec["dimensions"]
        if spec.get("filters"):
            bundle_spec["filters"] = spec["filters"]

        bundle_result = self.execute(
            bundle_spec,
            organisation=organisation,
            bypass_cache=bypass_cache,
            cache_ttl=cache_ttl,
        )

        filtered = _filter_single_value_measure(bundle_result, measure_id)
        if not bypass_cache:
            self.cache.set(cache_key, filtered, ttl=cache_ttl)
        return filtered

    def _normalise(self, spec: Dict[str, Any], compiled: CompiledQuery, frame: pd.DataFrame) -> Dict[str, Any]:
        chart_type = spec["chartType"]
        if chart_type == "single_value":
            return self._normalise_single_value(spec, compiled, frame)
        if chart_type == "composed_time":
            return self._normalise_time_series(spec, compiled, frame)
        if chart_type in {"heatmap", "retention"}:
            return self._normalise_heatmap(spec, compiled, frame)
        if chart_type == "categorical":
            return self._normalise_categorical(spec, compiled, frame)
        raise UnsupportedChartExecution(chart_type)

    def _normalise_categorical(
        self, spec: Dict[str, Any], compiled: CompiledQuery, frame: pd.DataFrame
    ) -> Dict[str, Any]:
        measures = compiled.measures
        timezone = spec["timeWindow"].get("timezone", "UTC")
        series: List[Dict[str, Any]] = []

        for measure_id, aggregation in measures.items():
            subset = frame[frame["measure_id"] == measure_id]
            buckets: Dict[str, Dict[str, Any]] = {}
            for record in subset.to_dict("records"):
                label = record.get("category_value")
                if label is None or (hasattr(pd, "isna") and pd.isna(label)):
                    continue
                value = _coerce_number(record.get("value"))

                if isinstance(label, pd.Timestamp):
                    raw_x: object = int(label.hour)
                elif isinstance(label, datetime):
                    raw_x = label.hour
                elif isinstance(label, Number):
                    raw_x = int(label)
                else:
                    raw_x = label

                bucket_key = str(raw_x)
                bucket = buckets.setdefault(
                    bucket_key,
                    {
                        # Contract expects categorical x values to be strings, even when
                        # the underlying label is numeric (e.g. hour buckets).
                        "x": bucket_key,
                        "value": None,
                        "y": None,
                    },
                )

                if value is not None:
                    current = bucket["value"]
                    aggregated = float(value) if current is None else float(current) + float(value)
                    bucket["value"] = aggregated
                    bucket["y"] = aggregated

            data_points = [
                buckets[key] for key in sorted(buckets.keys(), key=_categorical_bucket_sort_key)
            ]
            series.append(
                {
                    "id": measure_id,
                    "label": _label_for_series(measure_id, aggregation),
                    "geometry": _GEOMETRY_MAP.get(aggregation, "bar"),
                    "axis": _AXIS_MAP.get(aggregation),
                    "unit": _UNIT_MAP.get(aggregation),
                    "data": data_points,
                }
            )

        dimension = spec["dimensions"][0]
        x_dimension = {
            "id": dimension["id"],
            "type": "category",
            "bucket": None,
            "timezone": timezone,
        }

        meta: Dict[str, Any] = {
            "timezone": timezone,
            "coverage": [],
            "surges": [],
            "summary": {"points": len(frame), "measures": list(measures.keys())},
        }

        return {
            "chartType": "categorical",
            "xDimension": x_dimension,
            "series": series,
            "meta": meta,
        }

    def _normalise_single_value(
        self, spec: Dict[str, Any], compiled: CompiledQuery, frame: pd.DataFrame
    ) -> Dict[str, Any]:
        measures = compiled.measures
        if len(measures) != 1:
            raise UnsupportedChartExecution("single_value requires exactly one measure")

        base = self._normalise_time_series(spec, compiled, frame)
        primary_measure_id = next(iter(measures.keys()))

        for series in base["series"]:
            series["geometry"] = "metric"
            series.pop("axis", None)
            if series.get("data"):
                for point in series["data"]:
                    if "y" in point and "value" not in point:
                        point["value"] = point["y"]

        primary_series = next((s for s in base["series"] if s.get("id") == primary_measure_id), base["series"][0])
        numeric_points = [
            float(point.get("value"))
            for point in primary_series.get("data", [])
            if point.get("value") is not None
        ]
        if len(numeric_points) >= 2 and numeric_points[-2] != 0:
            delta = (numeric_points[-1] - numeric_points[-2]) / abs(numeric_points[-2])
            primary_series.setdefault("summary", {})["delta"] = delta

        return {**base, "chartType": "single_value"}

    def _normalise_time_series(
        self, spec: Dict[str, Any], compiled: CompiledQuery, frame: pd.DataFrame
    ) -> Dict[str, Any]:
        measures = compiled.measures
        timezone = spec["timeWindow"].get("timezone", "UTC")

        if frame.empty:
            coverage_meta: List[Dict[str, Any]] = []
        else:
            if {"bucket_start", "coverage"}.issubset(frame.columns):
                coverage_meta = (
                    frame.groupby("bucket_start")["coverage"]
                    .mean()
                    .reset_index()
                    .to_dict("records")
                )
                for entry in coverage_meta:
                    entry["x"] = _to_iso(entry.pop("bucket_start"))
                    coerced = _coerce_number(entry.pop("coverage"))
                    entry["value"] = float(coerced) if coerced is not None else None
            else:
                coverage_meta = []

        expected_buckets: List[str] = []
        if coverage_meta:
            expected_buckets = [entry["x"] for entry in coverage_meta]

        series: List[Dict[str, Any]] = []
        surges: List[Dict[str, Any]] = []
        for measure_id, aggregation in measures.items():
            subset = frame[frame["measure_id"] == measure_id]
            data_points: List[Dict[str, Any]] = []
            for record in subset.to_dict("records"):
                bucket = record.get("bucket_start")
                if bucket is None or (hasattr(pd, "isna") and pd.isna(bucket)):
                    continue
                value = _coerce_number(record.get("value"))
                coverage_value = _coerce_number(record.get("coverage"))
                raw_count_value = _coerce_number(record.get("raw_count"), cast=int)

                occupancy_min_value = _coerce_number(record.get("occupancy_min"))
                occupancy_max_value = _coerce_number(record.get("occupancy_max"))
                occupancy_avg_value = _coerce_number(record.get("occupancy_avg"))

                data_points.append(
                    {
                        "x": _to_iso(bucket),
                        "y": float(value) if value is not None else None,
                        "value": float(value) if value is not None else None,
                        "coverage": float(coverage_value) if coverage_value is not None else None,
                        "rawCount": int(raw_count_value) if raw_count_value is not None else None,
                        "occupancy_min": float(occupancy_min_value)
                        if occupancy_min_value is not None
                        else None,
                        "occupancy_max": float(occupancy_max_value)
                        if occupancy_max_value is not None
                        else None,
                        "occupancy_avg": float(occupancy_avg_value)
                        if occupancy_avg_value is not None
                        else None,
                    }
                )
            series.append(
                {
                    "id": measure_id,
                    "label": _label_for_series(measure_id, aggregation),
                    "geometry": _GEOMETRY_MAP.get(aggregation, "line"),
                    "axis": _AXIS_MAP.get(aggregation),
                    "unit": _UNIT_MAP.get(aggregation),
                    "data": data_points,
                }
            )
            surges.extend(_detect_surges(measure_id, data_points))

        spec_id = spec.get("id", "") if isinstance(spec, dict) else ""
        needs_alignment = expected_buckets and (
            spec_id.startswith("dashboard.live_flow") or spec_id.startswith("dashboard.kpi.vrm.")
        )
        if needs_alignment:
            bucket_lookup = list(dict.fromkeys(expected_buckets))
            for series_entry in series:
                existing = {point["x"]: point for point in series_entry.get("data", [])}
                aligned: List[Dict[str, Any]] = []
                for bucket_x in bucket_lookup:
                    point = existing.get(bucket_x)
                    if point is None:
                        point = {
                            "x": bucket_x,
                            "y": 0.0,
                            "value": 0.0,
                            "coverage": 0.0,
                            "rawCount": 0,
                            "occupancy_min": 0.0,
                            "occupancy_max": 0.0,
                            "occupancy_avg": 0.0,
                        }
                    aligned.append(point)
                series_entry["data"] = aligned

        dimension = spec["dimensions"][0]
        x_dimension = {
            "id": dimension["id"],
            "type": "time" if dimension.get("bucket") or dimension["column"] == "timestamp" else "category",
            "bucket": dimension.get("bucket", compiled.bucket if compiled.bucket != "RAW" else None),
            "timezone": timezone,
        }

        meta: Dict[str, Any] = {
            "timezone": timezone,
            "coverage": coverage_meta,
            "surges": surges,
            "summary": {
                "points": len(frame),
                "measures": list(measures.keys()),
            },
        }

        return {
            "chartType": "composed_time",
            "xDimension": x_dimension,
            "series": series,
            "meta": meta,
        }

    def _normalise_heatmap(
        self, spec: Dict[str, Any], compiled: CompiledQuery, frame: pd.DataFrame
    ) -> Dict[str, Any]:
        measures = compiled.measures
        if any(agg == "retention_rate" for agg in measures.values()):
            return self._normalise_retention_heatmap(spec, compiled, frame)

        timezone = spec["timeWindow"].get("timezone", "UTC")

        if frame.empty:
            coverage_meta: List[Dict[str, Any]] = []
        else:
            if {"bucket_start", "coverage"}.issubset(frame.columns):
                coverage_meta = (
                    frame.groupby("bucket_start")["coverage"]
                    .mean()
                    .reset_index()
                    .to_dict("records")
                )
                for entry in coverage_meta:
                    entry["x"] = _to_iso(entry.pop("bucket_start"))
                    coerced = _coerce_number(entry.pop("coverage"))
                    entry["value"] = float(coerced) if coerced is not None else None
            else:
                coverage_meta = []

        series: List[Dict[str, Any]] = []
        for measure_id, aggregation in measures.items():
            subset = frame[frame["measure_id"] == measure_id]
            data_points: List[Dict[str, Any]] = []
            for record in subset.to_dict("records"):
                lag_raw = record.get("lag_weeks", 0)
                lag_value = _coerce_number(lag_raw, cast=int) or 0
                if compiled.bucket == "MONTH":
                    group_label = f"Month {lag_value}"
                else:
                    group_label = f"Week {lag_value}"
                bucket = record.get("bucket_start")
                if bucket is None or (hasattr(pd, "isna") and pd.isna(bucket)):
                    continue
                value = _coerce_number(record.get("value"))
                coverage_value = _coerce_number(record.get("coverage"))
                raw_count_value = _coerce_number(record.get("raw_count"), cast=int)

                data_points.append(
                    {
                        "x": _to_iso(bucket),
                        "group": group_label,
                        "value": float(value) if value is not None else None,
                        "coverage": float(coverage_value) if coverage_value is not None else None,
                        "rawCount": int(raw_count_value) if raw_count_value is not None else None,
                    }
                )
            series.append(
                {
                    "id": measure_id,
                    "label": _label_for_series(measure_id, aggregation),
                    "geometry": _GEOMETRY_MAP.get(aggregation, "heatmap"),
                    "unit": _UNIT_MAP.get(aggregation),
                    "data": data_points,
                }
            )

        dimension = spec["dimensions"][0]
        x_dimension = {
            "id": dimension["id"],
            "type": "matrix",
            "bucket": dimension.get("bucket", compiled.bucket if compiled.bucket != "RAW" else None),
            "timezone": timezone,
        }

        meta: Dict[str, Any] = {
            "timezone": timezone,
            "coverage": coverage_meta,
            "surges": [],
            "summary": {
                "points": len(frame),
            },
        }

        return {
            "chartType": "heatmap",
            "xDimension": x_dimension,
            "series": series,
            "meta": meta,
        }

    def _normalise_retention_heatmap(
        self, spec: Dict[str, Any], compiled: CompiledQuery, frame: pd.DataFrame
    ) -> Dict[str, Any]:
        measures = compiled.measures
        timezone = spec["timeWindow"].get("timezone", "UTC")

        if frame.empty:
            coverage_meta: List[Dict[str, Any]] = []
        else:
            if {"bucket_start", "coverage"}.issubset(frame.columns):
                coverage_meta = (
                    frame.groupby("bucket_start")["coverage"]
                    .mean()
                    .reset_index()
                    .to_dict("records")
                )
                for entry in coverage_meta:
                    entry["x"] = _to_iso(entry.pop("bucket_start"))
                    coerced = _coerce_number(entry.pop("coverage"))
                    entry["value"] = float(coerced) if coerced is not None else None
            else:
                coverage_meta = []

        dimension = spec["dimensions"][0]
        x_dimension = {
            "id": dimension["id"],
            "type": "matrix",
            "bucket": dimension.get("bucket", compiled.bucket if compiled.bucket != "RAW" else None),
            "timezone": timezone,
        }

        # Retention heatmaps emit a rectangular matrix keyed by cohort (x) and lag (group).
        series: List[Dict[str, Any]] = []
        for measure_id, aggregation in measures.items():
            subset = frame[frame["measure_id"] == measure_id]
            cell_map: Dict[tuple[str, int], tuple[Optional[float], Optional[float]]] = {}
            cohorts: Dict[str, Any] = {}
            lags: List[int] = []

            for record in subset.to_dict("records"):
                bucket = record.get("bucket_start")
                if bucket is None or (hasattr(pd, "isna") and pd.isna(bucket)):
                    continue

                lag_value = _coerce_number(record.get("lag_weeks"), cast=int)
                if lag_value is None:
                    continue

                value = _coerce_number(record.get("value"))
                coverage_value = _coerce_number(record.get("coverage"))

                bucket_iso = _to_iso(bucket)
                cohorts[bucket_iso] = bucket
                lags.append(int(lag_value))
                cell_map[(bucket_iso, int(lag_value))] = (value, coverage_value)

            # Ensure a complete matrix for all observed cohorts and lags.
            cohort_labels = [
                _to_iso(value)
                for value in sorted(set(cohorts.values()))
                if value is not None and not (hasattr(pd, "isna") and pd.isna(value))
            ]
            lag_indexes = sorted(set(lags))

            data_points: List[Dict[str, Any]] = []
            for lag_value in lag_indexes:
                group_label = (
                    f"Month {lag_value}" if compiled.bucket == "MONTH" else f"Week {lag_value}"
                )
                for cohort_label in cohort_labels:
                    value, coverage_value = cell_map.get((cohort_label, lag_value), (None, None))
                    point: Dict[str, Any] = {
                        "x": cohort_label,
                        "group": group_label,
                        "value": float(value) if value is not None else None,
                    }
                    if coverage_value is not None:
                        point["coverage"] = float(coverage_value)

                    data_points.append(point)

            summary = {
                "points": len(data_points),
                "cohorts": len(cohort_labels),
                "lags": len(set(lags)),
            }

            series.append(
                {
                    "id": measure_id,
                    "label": _label_for_series(measure_id, aggregation),
                    "geometry": _GEOMETRY_MAP.get(aggregation, "heatmap"),
                    "unit": _UNIT_MAP.get(aggregation),
                    "data": data_points,
                    "summary": summary,
                }
            )

            meta: Dict[str, Any] = {
                "timezone": timezone,
                "coverage": coverage_meta,
                "surges": [],
                "summary": {
                    "points": sum(len(series_item.get("data", [])) for series_item in series),
                },
            }

        return {
            "chartType": "retention",
            "xDimension": x_dimension,
            "series": series,
            "meta": meta,
        }


class UnsupportedChartExecution(RuntimeError):
    """Raised when the engine cannot normalise the requested chart type yet."""
