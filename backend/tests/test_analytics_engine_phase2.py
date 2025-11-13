"""Phase 2 analytics compiler and engine tests."""
from __future__ import annotations

import copy
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.app.analytics import (
    AnalyticsEngine,
    LocalCacheBackend,
    SpecCache,
    SpecCompiler,
    TableRouter,
    build_cache_key,
    hash_spec,
)
from backend.app.analytics.compiler import CompilerContext


@pytest.fixture
def chart_spec() -> dict:
    return {
        "id": "live-flow",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [
            {"id": "occupancy", "aggregation": "occupancy_recursion"},
            {"id": "activity", "aggregation": "count"},
        ],
        "dimensions": [
            {"id": "time", "column": "timestamp", "bucket": "HOUR"}
        ],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-01T03:00:00Z",
            "bucket": "HOUR",
            "timezone": "UTC",
        },
        "filters": [
            {
                "logic": "AND",
                "conditions": [
                    {"field": "site_id", "op": "equals", "value": "SITE_01"},
                    {"field": "cam_id", "op": "in", "value": ["CAM_1", "CAM_2"]},
                ],
            }
        ],
    }


class StubBigQueryClient:
    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame
        self.calls = 0
        self.last_sql = None
        self.last_params = None

    def query_dataframe(self, sql: str, params: dict, job_context: str | None = None) -> pd.DataFrame:
        self.calls += 1
        self.last_sql = sql
        self.last_params = params
        return self.frame.copy()


def test_spec_hash_is_deterministic(chart_spec):
    first = hash_spec(chart_spec)
    shuffled = copy.deepcopy(chart_spec)
    shuffled["measures"].reverse()
    second = hash_spec(shuffled)
    assert first != second  # different measure ordering affects hash

    # Removing order differences in dict keys should keep hash stable
    reordered = copy.deepcopy(chart_spec)
    reordered["filters"][0]["conditions"][0] = {
        "value": "SITE_01",
        "op": "equals",
        "field": "site_id",
    }
    assert hash_spec(chart_spec) == hash_spec(reordered)


def test_table_router_requires_fully_qualified_names():
    router = TableRouter({"org": "project.dataset.table"})
    assert router.resolve("org") == "project.dataset.table"
    with pytest.raises(ValueError):
        TableRouter({"bad": "dataset.table"}).resolve("bad")


def test_cache_key_includes_table_prefix(chart_spec):
    key = build_cache_key(chart_spec, table_name="nigzsu.analytics.client0")
    assert key.startswith("nigzsu.analytics.client0:")
    assert hash_spec(chart_spec) in key


def test_compiler_generates_expected_sql(chart_spec):
    compiler = SpecCompiler()
    context = CompilerContext(table_name="nigzsu.analytics.client0")
    compiled = compiler.compile(chart_spec, context)

    assert "scoped AS" in compiled.sql
    assert "calendar AS" in compiled.sql
    assert "GENERATE_TIMESTAMP_ARRAY" in compiled.sql
    assert "occupancy" in compiled.sql
    assert "raw_count" in compiled.sql
    assert "LOGICAL_OR" in compiled.sql
    assert "LAST_VALUE" in compiled.sql
    assert "UNION ALL" in compiled.sql
    assert compiled.params["start_ts"] == "2024-01-01T00:00:00Z"
    assert compiled.params["end_ts"] == "2024-01-01T03:00:00Z"
    assert compiled.params["site_id_0"] == "SITE_01"
    assert compiled.params["cam_id_0"] == ["CAM_1", "CAM_2"]


def test_compiler_supports_text_operators(chart_spec):
    spec = copy.deepcopy(chart_spec)
    spec["filters"][0]["conditions"].extend(
        [
            {"field": "site_id", "op": "contains", "value": "SITE"},
            {"field": "cam_id", "op": "starts_with", "value": "CAM"},
            {"field": "cam_id", "op": "ends_with", "value": "2"},
        ]
    )
    compiler = SpecCompiler()
    context = CompilerContext(table_name="nigzsu.analytics.client0")
    compiled = compiler.compile(spec, context)
    sql = compiled.sql
    assert "STRPOS" in sql
    assert "STARTS_WITH" in sql
    assert "ENDS_WITH" in sql
    assert any(key.startswith("site_id") for key in compiled.params)


def test_engine_executes_and_caches(chart_spec):
    frame = pd.DataFrame(
        [
            {
                "measure_id": "occupancy",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 12.0,
                "coverage": 1.0,
                "raw_count": 4,
            },
            {
                "measure_id": "activity",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 3.0,
                "coverage": 1.0,
                "raw_count": 3,
            },
            {
                "measure_id": "occupancy",
                "bucket_start": pd.Timestamp("2024-01-01T01:00:00Z"),
                "value": 45.0,
                "coverage": 0.8,
                "raw_count": 1,
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

    result = engine.execute(chart_spec, organisation="client0")
    assert stub.calls == 1
    assert result["chartType"] == "composed_time"
    assert result["series"][0]["id"] == "occupancy"
    assert result["series"][0]["unit"] == "people"
    assert result["series"][0]["data"][0]["rawCount"] == 4
    assert len(result["meta"]["coverage"]) == 2
    assert result["meta"]["surges"], "Expected surge detection metadata"

    # Second call should hit cache and avoid extra BigQuery round-trip
    cached = engine.execute(chart_spec, organisation="client0")
    assert stub.calls == 1
    assert cached == result

    # Bypass cache triggers another BigQuery call
    engine.execute(chart_spec, organisation="client0", bypass_cache=True)
    assert stub.calls == 2


def test_compiler_generates_dwell_pipeline():
    spec = {
        "id": "dwell-series",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [
            {"id": "avg_dwell", "aggregation": "dwell_mean"},
            {"id": "session_count", "aggregation": "sessions"},
        ],
        "dimensions": [{"id": "time", "column": "timestamp", "bucket": "HOUR"}],
        "timeWindow": {
            "from": "2024-02-01T00:00:00Z",
            "to": "2024-02-01T06:00:00Z",
            "bucket": "HOUR",
            "timezone": "UTC",
        },
    }
    compiler = SpecCompiler()
    context = CompilerContext(table_name="nigzsu.analytics.client0")
    compiled = compiler.compile(spec, context)

    sql = compiled.sql
    assert "avg_dwell_dwell_sessions AS" in sql
    assert "APPROX_QUANTILES" in sql
    assert "session_count AS raw_count" in sql
    assert "SAFE_DIVIDE(window_seconds, bucket_seconds)" in sql


def test_compiler_generates_retention_pipeline():
    spec = {
        "id": "retention-heatmap",
        "dataset": "events",
        "chartType": "heatmap",
        "measures": [
            {"id": "retention", "aggregation": "retention_rate"},
        ],
        "dimensions": [{"id": "cohort", "column": "timestamp", "bucket": "WEEK"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-03-01T00:00:00Z",
            "bucket": "WEEK",
            "timezone": "UTC",
        },
    }
    compiler = SpecCompiler()
    context = CompilerContext(table_name="nigzsu.analytics.client0")
    compiled = compiler.compile(spec, context)

    sql = compiled.sql
    assert "retention_calendar AS" in sql
    assert "retention_returns AS" in sql
    assert "SAFE_DIVIDE(returning, cohort_size)" in sql
    assert "SAFE_DIVIDE(cohort_size, 100" in sql
    assert "lag_weeks" in sql


def test_engine_normalises_dwell_and_sessions():
    spec = {
        "id": "dwell-series",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [
            {"id": "avg_dwell", "aggregation": "dwell_mean"},
            {"id": "session_count", "aggregation": "sessions"},
        ],
        "dimensions": [{"id": "time", "column": "timestamp", "bucket": "HOUR"}],
        "timeWindow": {
            "from": "2024-02-01T00:00:00Z",
            "to": "2024-02-01T03:00:00Z",
            "bucket": "HOUR",
            "timezone": "UTC",
        },
    }
    frame = pd.DataFrame(
        [
            {
                "measure_id": "avg_dwell",
                "bucket_start": pd.Timestamp("2024-02-01T00:00:00Z"),
                "value": 12.5,
                "coverage": 0.75,
                "raw_count": 4,
            },
            {
                "measure_id": "session_count",
                "bucket_start": pd.Timestamp("2024-02-01T00:00:00Z"),
                "value": 4,
                "coverage": 0.75,
                "raw_count": 4,
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

    result = engine.execute(spec, organisation="client0", bypass_cache=True)
    assert result["chartType"] == "composed_time"
    dwell_series = next(item for item in result["series"] if item["id"] == "avg_dwell")
    assert dwell_series["unit"] == "minutes"
    assert dwell_series["geometry"] == "line"
    assert dwell_series["data"][0]["rawCount"] == 4
    sessions_series = next(item for item in result["series"] if item["id"] == "session_count")
    assert sessions_series["unit"] == "sessions"
    assert sessions_series["geometry"] == "column"


def test_engine_normalises_retention_heatmap():
    spec = {
        "id": "retention-heatmap",
        "dataset": "events",
        "chartType": "heatmap",
        "measures": [
            {"id": "retention", "aggregation": "retention_rate"},
        ],
        "dimensions": [{"id": "cohort", "column": "timestamp", "bucket": "WEEK"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-02-12T00:00:00Z",
            "bucket": "WEEK",
            "timezone": "UTC",
        },
    }
    frame = pd.DataFrame(
        [
            {
                "measure_id": "retention",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "lag_weeks": 0,
                "value": 1.0,
                "coverage": 1.0,
                "raw_count": 120,
            },
            {
                "measure_id": "retention",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "lag_weeks": 1,
                "value": 0.65,
                "coverage": 0.8,
                "raw_count": 78,
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

    result = engine.execute(spec, organisation="client0", bypass_cache=True)
    assert result["chartType"] == "heatmap"
    series = result["series"][0]
    assert series["geometry"] == "heatmap"
    assert series["unit"] == "rate"
    assert series["data"][1]["group"] == "Week 1"
    assert series["data"][1]["coverage"] == 0.8
