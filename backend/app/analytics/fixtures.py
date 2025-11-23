"""Offline analytics fixtures for environments without BigQuery access."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from .contracts import validate_chart_result

logger = logging.getLogger(__name__)


FIXTURE_BASE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "analytics" / "examples"


def _load_frontend_fixture(name: str) -> Dict[str, Any]:
    path = FIXTURE_BASE / name
    if not path.exists():
        raise FileNotFoundError(str(path))
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _time_buckets(count: int, bucket_minutes: int = 15) -> List[str]:
    now = datetime.now(tz=timezone.utc).replace(second=0, microsecond=0)
    buckets: List[str] = []
    for idx in range(count):
        bucket_start = now - timedelta(minutes=bucket_minutes * (count - idx))
        buckets.append(bucket_start.isoformat().replace("+00:00", "Z"))
    return buckets


def _unit_for_aggregation(aggregation: str) -> str:
    if aggregation == "occupancy_recursion":
        return "people"
    if aggregation in {"count", "demographic_count"}:
        return "events"
    if aggregation in {"activity_rate", "sessions"}:
        return "count"
    if aggregation in {"dwell_mean", "dwell_p90"}:
        return "minutes"
    if aggregation == "retention_rate":
        return "percentage"
    return "count"


def _single_value_fixture(spec: Dict[str, Any]) -> Dict[str, Any]:
    measure = spec["measures"][0]
    measure_id = measure.get("id", "value")
    unit = _unit_for_aggregation(measure.get("aggregation", "count"))
    buckets = _time_buckets(6, bucket_minutes=15)
    base_value = 100 if unit == "percentage" else 20
    data = [
        {
          "x": bucket,
          "value": base_value + idx * 5,
          "coverage": 1.0,
          "rawCount": base_value + idx * 5,
        }
        for idx, bucket in enumerate(buckets)
    ]

    result = {
        "chartType": "single_value",
        "xDimension": {
            "id": spec["dimensions"][0]["id"],
            "type": "time",
            "bucket": spec["timeWindow"].get("bucket") or spec["dimensions"][0].get("bucket"),
            "timezone": spec["timeWindow"].get("timezone", "UTC"),
        },
        "series": [
            {
                "id": measure_id,
                "label": measure.get("label", measure_id.title()),
                "geometry": "metric",
                "unit": unit,
                "data": data,
                "summary": {"delta": 0.05},
            }
        ],
        "meta": {
            "timezone": spec["timeWindow"].get("timezone", "UTC"),
            "summary": {"points": len(data), "measures": [measure_id]},
            "coverage": [{"x": bucket, "value": 1.0} for bucket in buckets],
        },
    }
    validate_chart_result(result)
    return result


def _traffic_time_series_fixture() -> Dict[str, Any]:
    buckets = _time_buckets(8, bucket_minutes=15)
    camera_series = {
        "cam_1": [10, 12, 14, 16, 18, 22, 25, 28],
        "cam_2": [6, 7, 9, 11, 12, 14, 15, 17],
        "cam_3": [3, 3, 4, 5, 5, 6, 7, 8],
    }
    series: List[Dict[str, Any]] = []
    for cam_id, values in camera_series.items():
        data = []
        for bucket, value in zip(buckets, values):
            data.append({"x": bucket, "y": float(value), "coverage": 1.0, "rawCount": value})
        series.append(
            {
                "id": f"{cam_id}_events",
                "label": f"Cam {cam_id}",
                "geometry": "column",
                "axis": "Y2",
                "unit": "events",
                "data": data,
            }
        )

    result: Dict[str, Any] = {
        "chartType": "composed_time",
        "xDimension": {"id": "timestamp", "type": "time", "bucket": "15_MIN", "timezone": "UTC"},
        "series": series,
        "meta": {"timezone": "UTC", "summary": {}},
    }
    validate_chart_result(result)
    return result


FRONTEND_FIXTURE_MAP = {
    "dashboard.kpi.vrm.entrances": "golden_dashboard_kpi_entrances.json",
    "dashboard.kpi.vrm.occupancy": "golden_dashboard_kpi_live_occupancy.json",
    "dashboard.kpi.vrm.exits": "golden_dashboard_kpi_exits.json",
    "dashboard.kpi.vrm.footfall": "golden_dashboard_kpi_activity.json",
    "dashboard.kpi.vrm.dwell": "golden_dashboard_kpi_avg_dwell.json",
    "dashboard.kpi.vrm.capacity_usage": "golden_dashboard_kpi_live_occupancy.json",
}


def build_offline_chart_result(spec: Dict[str, Any]) -> Dict[str, Any]:
    """Return a contract-valid ChartResult without querying BigQuery."""

    spec_id = spec.get("id")
    if spec_id == "dashboard.kpi.vrm.traffic_distribution":
        result = _traffic_time_series_fixture()
        logger.info("analytics.offline.fixture", extra={"spec_id": spec_id, "mode": "traffic"})
        return result

    fixture_name = FRONTEND_FIXTURE_MAP.get(spec_id)
    if fixture_name:
        try:
            result = _load_frontend_fixture(fixture_name)
            validate_chart_result(result)
            logger.info(
                "analytics.offline.fixture",
                extra={"spec_id": spec_id, "mode": "frontend_fixture"},
            )
            return result
        except FileNotFoundError:
            logger.warning(
                "analytics.offline.fixture_missing", extra={"spec_id": spec_id, "fixture": fixture_name}
            )
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception("analytics.offline.fixture_load_failed", extra={"spec_id": spec_id, "error": str(exc)})

    chart_type = spec.get("chartType")
    if chart_type == "single_value":
        logger.info("analytics.offline.fixture", extra={"spec_id": spec_id, "mode": "synthetic_single_value"})
        return _single_value_fixture(spec)

    raise ValueError(f"No offline fixture available for spec {spec_id}")

