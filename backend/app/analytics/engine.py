"""Analytics execution engine wiring the compiler, BigQuery, and caching."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from numbers import Number
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd

from ..bigquery_client import BigQueryDataFrameError
from .cache import SpecCache
from .compiler import CompiledQuery, CompilerContext, SpecCompiler
from .contracts import validate_chart_result
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
        logger.info(
            "analytics.run.resolved_table org=%s table=%s",
            organisation,
            table_name,
            extra={"spec_id": spec.get("id"), "org": organisation, "table": table_name},
        )
        cache_key = build_cache_key(spec, table_name=table_name)
        if not bypass_cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached

        compiled = self.compiler.compile(spec, CompilerContext(table_name=table_name))
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
            data_points: List[Dict[str, Any]] = []
            for record in subset.to_dict("records"):
                label = record.get("category_value")
                if label is None or (hasattr(pd, "isna") and pd.isna(label)):
                    continue
                value = _coerce_number(record.get("value"))

                if isinstance(label, pd.Timestamp):
                    x_value: object = int(label.hour)
                elif isinstance(label, datetime):
                    x_value = label.hour
                elif isinstance(label, Number):
                    x_value = int(label)
                else:
                    x_value = str(label)

                data_points.append(
                    {
                        "x": x_value,
                        "value": float(value) if value is not None else None,
                        "y": float(value) if value is not None else None,
                    }
                )
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

