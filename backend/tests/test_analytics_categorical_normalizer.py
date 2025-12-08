from __future__ import annotations

import pandas as pd

from backend.app.analytics import AnalyticsEngine, LocalCacheBackend, SpecCache, TableRouter


class StubBigQueryClient:
    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame
        self.calls = 0

    def query_dataframe(self, sql: str, params: dict, job_context: str | None = None) -> pd.DataFrame:  # pragma: no cover - passthrough
        self.calls += 1
        return self.frame.copy()
def _categorical_spec() -> dict:
    return {
        "id": "categorical-mixed-labels",
        "dataset": "events",
        "chartType": "categorical",
        "measures": [{"id": "demographics", "aggregation": "demographic_count"}],
        "dimensions": [{"id": "hour", "column": "timestamp", "bucket": "HOUR"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-02T00:00:00Z",
            "timezone": "UTC",
        },
    }


def test_categorical_normaliser_stringifies_numeric_labels():
    frame = pd.DataFrame(
        [
            {"measure_id": "demographics", "category_value": 0, "value": 10},
            {"measure_id": "demographics", "category_value": pd.Timestamp("2024-01-01T05:00:00Z"), "value": 2},
            {"measure_id": "demographics", "category_value": "18-24", "value": 3},
        ]
    )
    stub = StubBigQueryClient(frame)
    engine = AnalyticsEngine(
        table_router=TableRouter({"org": "project.dataset.table"}),
        bigquery_client=stub,
        cache=SpecCache(LocalCacheBackend(), default_ttl=60),
    )

    result = engine.execute(_categorical_spec(), organisation="org", bypass_cache=True)

    points = result["series"][0]["data"]
    assert [point["x"] for point in points] == ["0", "5", "18-24"]
    assert all(isinstance(point["x"], str) for point in points)
    assert [point["value"] for point in points] == [10.0, 2.0, 3.0]


def test_categorical_normaliser_keeps_cache_hits_valid():
    frame = pd.DataFrame([
        {"measure_id": "demographics", "category_value": 23, "value": 1},
    ])
    stub = StubBigQueryClient(frame)
    engine = AnalyticsEngine(
        table_router=TableRouter({"org": "project.dataset.table"}),
        bigquery_client=stub,
        cache=SpecCache(LocalCacheBackend(), default_ttl=60),
    )

    first = engine.execute(_categorical_spec(), organisation="org")
    cached = engine.execute(_categorical_spec(), organisation="org")

    assert first == cached
    assert cached["series"][0]["data"][0]["x"] == "23"
    assert stub.calls == 1
