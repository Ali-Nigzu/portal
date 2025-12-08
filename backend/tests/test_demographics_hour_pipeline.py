from __future__ import annotations

import pandas as pd

from backend.app.analytics import AnalyticsEngine, LocalCacheBackend, SpecCache, TableRouter
from backend.app.analytics.compiler import CompilerContext, SpecCompiler


class StubBigQueryClient:
    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame
        self.calls = 0
        self.last_sql: str | None = None

    def query_dataframe(self, sql: str, params: dict, job_context: str | None = None) -> pd.DataFrame:  # pragma: no cover - passthrough
        self.calls += 1
        self.last_sql = sql
        return self.frame.copy()


def _demographics_hour_spec() -> dict:
    return {
        "id": "dashboard.site_flow.demographics.hour",
        "dataset": "events",
        "chartType": "categorical",
        "measures": [{"id": "events", "aggregation": "count", "label": "Events"}],
        "dimensions": [{"id": "timestamp", "column": "timestamp", "bucket": "HOUR", "sort": "asc"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-02T00:00:00Z",
            "timezone": "UTC",
        },
    }


def test_demographics_hour_compiler_uses_hour_extract():
    compiler = SpecCompiler()
    compiled = compiler.compile(_demographics_hour_spec(), CompilerContext(table_name="project.dataset.table"))

    assert "EXTRACT(HOUR FROM scoped.timestamp)" in compiled.sql


def test_demographics_hour_pipeline_surfaces_multiple_buckets():
    frame = pd.DataFrame(
        [
            {"measure_id": "events", "category_value": pd.Timestamp("2024-01-01T09:00:00Z"), "value": 5},
            {"measure_id": "events", "category_value": pd.Timestamp("2024-01-01T10:00:00Z"), "value": 3},
            {"measure_id": "events", "category_value": pd.Timestamp("2024-01-01T11:00:00Z"), "value": 7},
        ]
    )

    stub = StubBigQueryClient(frame)
    engine = AnalyticsEngine(
        table_router=TableRouter({"org": "project.dataset.table"}),
        bigquery_client=stub,
        cache=SpecCache(LocalCacheBackend(), default_ttl=60),
    )

    result = engine.execute(_demographics_hour_spec(), organisation="org", bypass_cache=True)

    series = result["series"][0]
    bucket_keys = {point.get("x") for point in series.get("data", [])}

    assert bucket_keys == {"9", "10", "11"}
    assert all(point.get("value") is not None for point in series.get("data", []))
    assert stub.calls == 1
