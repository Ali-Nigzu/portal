"""Lightweight runtime validators for ChartSpec and ChartResult payloads."""
from __future__ import annotations

from typing import Any, Dict, Iterable

CHART_TYPES = {"composed_time", "categorical", "heatmap", "retention", "single_value"}
TIME_BUCKETS = {"RAW", "5_MIN", "15_MIN", "30_MIN", "HOUR", "DAY", "WEEK", "MONTH"}
MEASURE_AGGREGATIONS = {
    "occupancy_recursion",
    "count",
    "activity_rate",
    "dwell_mean",
    "dwell_p90",
    "sessions",
    "demographic_count",
    "retention_rate",
}
FILTER_OPERATORS = {
    "equals",
    "not_equals",
    "in",
    "not_in",
    "between",
    "gte",
    "lte",
    "gt",
    "lt",
    "contains",
    "starts_with",
    "ends_with",
}
INTERACTION_EXPORTS = {"png", "csv", "xlsx"}
AXES = {"Y1", "Y2", "Y3"}
GEOMETRIES = {"line", "area", "column", "bar", "heatmap", "scatter", "metric"}


class ValidationError(ValueError):
    """Raised when a payload does not conform to the analytics contract."""


def _ensure(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def _validate_filter_group(group: Dict[str, Any]) -> None:
    _ensure(group.get("logic") in {"AND", "OR"}, "Invalid filter logic")
    conditions = group.get("conditions")
    _ensure(isinstance(conditions, list) and conditions, "Filter group requires conditions")
    for condition in conditions:
        if isinstance(condition, dict) and "logic" in condition:
            _validate_filter_group(condition)
        else:
            _validate_filter_condition(condition)


def _validate_filter_condition(condition: Dict[str, Any]) -> None:
    _ensure(isinstance(condition, dict), "Filter condition must be object")
    _ensure(isinstance(condition.get("field"), str), "Filter condition field must be string")
    _ensure(condition.get("op") in FILTER_OPERATORS, "Unsupported filter operator")
    if "value" in condition:
        value = condition["value"]
        _ensure(
            isinstance(value, (str, int, float, bool, list)),
            "Filter value must be scalar or list",
        )
        if isinstance(value, list):
            _ensure(all(isinstance(v, (str, int, float)) for v in value), "List values must be scalar" )


def validate_chart_spec(payload: Dict[str, Any]) -> None:
    """Validate a ChartSpec dictionary raising ValidationError on mismatch."""
    _ensure(payload.get("dataset") == "events", "Dataset must be 'events'")
    _ensure(payload.get("chartType") in CHART_TYPES, "Invalid chart type")
    _ensure(isinstance(payload.get("measures"), list) and payload["measures"], "Measures required")
    for measure in payload["measures"]:
        _ensure(isinstance(measure.get("id"), str) and measure["id"], "Measure id required")
        _ensure(measure.get("aggregation") in MEASURE_AGGREGATIONS, "Invalid measure aggregation")
        if "eventTypes" in measure:
            event_types = measure["eventTypes"]
            _ensure(isinstance(event_types, list), "eventTypes must be list")
            _ensure(all(ev in (0, 1) for ev in event_types), "eventTypes must contain 0/1")
    _ensure(isinstance(payload.get("dimensions"), list) and payload["dimensions"], "Dimensions required")
    for dimension in payload["dimensions"]:
        _ensure(isinstance(dimension.get("id"), str), "Dimension id required")
        _ensure(isinstance(dimension.get("column"), str), "Dimension column required")
        bucket = dimension.get("bucket")
        if bucket is not None:
            _ensure(bucket in TIME_BUCKETS, "Invalid dimension bucket")
    if payload.get("splits"):
        for split in payload["splits"]:
            _ensure(isinstance(split.get("id"), str), "Split id required")
            _ensure(isinstance(split.get("column"), str), "Split column required")
    if payload.get("filters"):
        for group in payload["filters"]:
            _validate_filter_group(group)
    time_window = payload.get("timeWindow")
    _ensure(isinstance(time_window, dict), "timeWindow is required")
    _ensure(isinstance(time_window.get("from"), str), "timeWindow.from must be string")
    _ensure(isinstance(time_window.get("to"), str), "timeWindow.to must be string")
    bucket = time_window.get("bucket")
    if bucket is not None:
        _ensure(bucket in TIME_BUCKETS, "Invalid timeWindow bucket")
    interactions = payload.get("interactions")
    if interactions:
        exports = interactions.get("export")
        if exports is not None:
            _ensure(isinstance(exports, list), "interactions.export must be list")
            _ensure(all(item in INTERACTION_EXPORTS for item in exports), "Unsupported export type")


def _validate_series_data(data: Iterable[Any]) -> None:
    _ensure(isinstance(data, list), "Series data must be list")
    for point in data:
        _ensure(isinstance(point, dict), "Series point must be object")
        _ensure(isinstance(point.get("x"), str), "Series point requires x value")
        if "y" in point:
            _ensure(point["y"] is None or isinstance(point["y"], (int, float)), "y must be numeric or null")
        if "value" in point:
            _ensure(point["value"] is None or isinstance(point["value"], (int, float)), "value must be numeric or null")
        if "coverage" in point and point["coverage"] is not None:
            _ensure(isinstance(point["coverage"], (int, float)), "coverage must be numeric")
            _ensure(0 <= float(point["coverage"]) <= 1, "coverage must be 0..1")
        if "rawCount" in point and point["rawCount"] is not None:
            _ensure(isinstance(point["rawCount"], (int, float)), "rawCount must be numeric")


def validate_chart_result(payload: Dict[str, Any]) -> None:
    _ensure(payload.get("chartType") in CHART_TYPES, "Invalid chart result type")
    x_dimension = payload.get("xDimension")
    _ensure(isinstance(x_dimension, dict), "xDimension required")
    _ensure(isinstance(x_dimension.get("id"), str), "xDimension id required")
    _ensure(x_dimension.get("type") in {"time", "category", "matrix", "index"}, "Invalid xDimension type")
    bucket = x_dimension.get("bucket")
    if bucket is not None:
        _ensure(isinstance(bucket, str), "xDimension bucket must be string")
    _ensure(isinstance(payload.get("series"), list) and payload["series"], "Series required")
    for series in payload["series"]:
        _ensure(isinstance(series.get("id"), str), "Series id required")
        _ensure(series.get("geometry") in GEOMETRIES, "Invalid series geometry")
        axis = series.get("axis")
        if axis is not None:
            _ensure(axis in AXES, "Invalid axis")
        _validate_series_data(series.get("data", []))
    meta = payload.get("meta")
    _ensure(isinstance(meta, dict), "Meta section required")
    _ensure(isinstance(meta.get("timezone"), str), "Timezone must be string")
    if "coverage" in meta:
        _validate_series_data(meta["coverage"])

