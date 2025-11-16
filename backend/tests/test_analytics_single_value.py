import pandas as pd
import pytest

from backend.app.analytics.cache import LocalCacheBackend, SpecCache
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec
from backend.app.analytics.engine import AnalyticsEngine, UnsupportedChartExecution
from backend.app.analytics.router import TableRouter


class StubBigQueryClient:
    def __init__(self, frame: pd.DataFrame):
        self._frame = frame

    def query_dataframe(self, sql: str, params, job_context=None):
        return self._frame


def test_single_value_kpis_normalise_to_metric_series():
    spec = get_dashboard_spec("dashboard.kpi.activity_today")
    frame = pd.DataFrame(
        [
            {
                "measure_id": "activity_total",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 4,
                "coverage": 1.0,
                "raw_count": 4,
            },
            {
                "measure_id": "activity_total",
                "bucket_start": pd.Timestamp("2024-01-01T01:00:00Z"),
                "value": 6,
                "coverage": 1.0,
                "raw_count": 6,
            },
        ]
    )

    engine = AnalyticsEngine(
        table_router=TableRouter({"org": "project.dataset.table"}),
        bigquery_client=StubBigQueryClient(frame),
        cache=SpecCache(LocalCacheBackend()),
    )

    result = engine.execute(spec, organisation="org", bypass_cache=True)

    assert result["chartType"] == "single_value"
    assert result["series"][0]["geometry"] == "metric"
    assert result["series"][0]["data"][-1]["value"] == 6


def test_single_value_rejects_multiple_measures():
    spec = get_dashboard_spec("dashboard.kpi.activity_today")
    spec["measures"].append({"id": "exits", "aggregation": "count", "eventTypes": [0]})
    frame = pd.DataFrame(
        [
            {
                "measure_id": "activity_total",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 1,
                "coverage": 1.0,
                "raw_count": 1,
            }
        ]
    )

    engine = AnalyticsEngine(
        table_router=TableRouter({"org": "project.dataset.table"}),
        bigquery_client=StubBigQueryClient(frame),
        cache=SpecCache(LocalCacheBackend()),
    )

    with pytest.raises(UnsupportedChartExecution):
        engine.execute(spec, organisation="org", bypass_cache=True)
