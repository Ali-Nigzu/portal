"""Retention heatmap result contract enforcement tests."""
from __future__ import annotations

import pandas as pd

from backend.app.analytics import AnalyticsEngine, LocalCacheBackend, SpecCache, TableRouter
from backend.app.analytics.contracts import validate_chart_result


class StubBigQueryClient:
    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame

    def query_dataframe(self, sql: str, params: dict, job_context: str | None = None) -> pd.DataFrame:
        return self.frame.copy()


def _retention_spec() -> dict:
    return {
        "id": "retention-heatmap",
        "dataset": "events",
        "chartType": "heatmap",
        "measures": [
            {"id": "retention_rate", "aggregation": "retention_rate"},
        ],
        "dimensions": [{"id": "cohort", "column": "timestamp", "bucket": "WEEK"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-02-12T00:00:00Z",
            "bucket": "WEEK",
            "timezone": "UTC",
        },
    }


def test_retention_heatmap_chartresult_passes_validator():
    frame = pd.DataFrame(
        [
            {
                "measure_id": "retention_rate",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "lag_weeks": 0,
                "value": 1.0,
                "coverage": 1.0,
            },
            {
                "measure_id": "retention_rate",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "lag_weeks": 1,
                "value": 0.5,
                "coverage": 0.9,
            },
            {
                "measure_id": "retention_rate",
                "bucket_start": pd.Timestamp("2024-01-08T00:00:00Z"),
                "lag_weeks": 0,
                "value": 1.0,
                "coverage": 1.0,
            },
        ]
    )

    stub = StubBigQueryClient(frame)
    cache = SpecCache(LocalCacheBackend(), default_ttl=60)
    engine = AnalyticsEngine(
        table_router=TableRouter({"client0": "nigzsu.dataset.client0"}),
        bigquery_client=stub,
        cache=cache,
    )

    result = engine.execute(_retention_spec(), organisation="client0", bypass_cache=True)

    validate_chart_result(result)
    series = result["series"][0]
    assert series["summary"]["cohorts"] == 2
    assert series["summary"]["lags"] == 2
    assert all("rawCount" not in point for point in series["data"])
