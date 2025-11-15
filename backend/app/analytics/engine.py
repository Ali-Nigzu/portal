"""Analytics execution engine wiring the compiler, BigQuery, and caching."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
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
    "sessions": "sessions",
    "retention_rate": "rate",
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
        if chart_type == "composed_time":
            return self._normalise_time_series(spec, compiled, frame)
        if chart_type in {"heatmap", "retention"}:
            return self._normalise_heatmap(spec, compiled, frame)
        raise UnsupportedChartExecution(chart_type)

    def _normalise_time_series(
        self, spec: Dict[str, Any], compiled: CompiledQuery, frame: pd.DataFrame
    ) -> Dict[str, Any]:
        measures = compiled.measures
        timezone = spec["timeWindow"].get("timezone", "UTC")

        if frame.empty:
            coverage_meta: List[Dict[str, Any]] = []
        else:
            coverage_meta = (
                frame.groupby("bucket_start")["coverage"]
                .mean()
                .reset_index()
                .to_dict("records")
            )
            for entry in coverage_meta:
                entry["x"] = _to_iso(entry.pop("bucket_start"))
                entry["value"] = float(entry.pop("coverage"))

        series: List[Dict[str, Any]] = []
        surges: List[Dict[str, Any]] = []
        for measure_id, aggregation in measures.items():
            subset = frame[frame["measure_id"] == measure_id]
            data_points: List[Dict[str, Any]] = []
            for record in subset.to_dict("records"):
                data_points.append(
                    {
                        "x": _to_iso(record["bucket_start"]),
                        "y": float(record["value"]) if record.get("value") is not None else None,
                        "coverage": float(record["coverage"]) if record.get("coverage") is not None else None,
                        "rawCount": int(record["raw_count"]) if record.get("raw_count") is not None else None,
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
        timezone = spec["timeWindow"].get("timezone", "UTC")

        if frame.empty:
            coverage_meta: List[Dict[str, Any]] = []
        else:
            coverage_meta = (
                frame.groupby("bucket_start")["coverage"]
                .mean()
                .reset_index()
                .to_dict("records")
            )
            for entry in coverage_meta:
                entry["x"] = _to_iso(entry.pop("bucket_start"))
                entry["value"] = float(entry.pop("coverage"))

        series: List[Dict[str, Any]] = []
        for measure_id, aggregation in measures.items():
            subset = frame[frame["measure_id"] == measure_id]
            data_points: List[Dict[str, Any]] = []
            for record in subset.to_dict("records"):
                lag_value = int(record.get("lag_weeks", 0))
                if compiled.bucket == "MONTH":
                    group_label = f"Month {lag_value}"
                else:
                    group_label = f"Week {lag_value}"
                data_points.append(
                    {
                        "x": _to_iso(record["bucket_start"]),
                        "group": group_label,
                        "value": float(record["value"]) if record.get("value") is not None else None,
                        "coverage": float(record["coverage"]) if record.get("coverage") is not None else None,
                        "rawCount": int(record["raw_count"]) if record.get("raw_count") is not None else None,
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
                "measures": list(measures.keys()),
            },
        }

        return {
            "chartType": "heatmap",
            "xDimension": x_dimension,
            "series": series,
            "meta": meta,
        }


class UnsupportedChartExecution(RuntimeError):
    """Raised when the engine cannot normalise the requested chart type yet."""

