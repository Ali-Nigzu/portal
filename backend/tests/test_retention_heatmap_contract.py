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
        "chartType": "retention",
        "measures": [
            {"id": "retention_rate", "aggregation": "retention_rate"},
        ],
        "dimensions": [
            {"id": "cohort_week", "column": "cohort_week", "bucket": "WEEK", "sort": "asc"}
        ],
        "splits": [{"id": "retention_lag", "column": "lag_weeks", "sort": "asc"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-02-12T00:00:00Z",
            "bucket": "WEEK",
            "timezone": "UTC",
        },
    }


SUPPORTED_UNITS = {"people", "events", "events/min", "minutes", "percentage", "count", None}


def _frontend_validate_heatmap(result: dict) -> list[str]:
    issues: list[str] = []

    for series in result.get("series", []):
        if series.get("unit") not in SUPPORTED_UNITS:
            issues.append(f"Unsupported unit {series.get('unit')} for series {series.get('id')}")

    if result.get("chartType") in {"heatmap", "retention"} and result.get("series"):
        heatmap = result["series"][0]
        rows: dict[str, set[str]] = {}
        columns: set[str] = set()
        for point in heatmap.get("data", []):
            row = point.get("group")
            column = point.get("x")
            if row is None or row == "":
                issues.append("Heatmap point missing row group")
                continue
            if column is None or column == "":
                issues.append("Heatmap point missing column")
                continue
            row_key = str(row)
            col_key = str(column)
            columns.add(col_key)
            rows.setdefault(row_key, set())
            if col_key in rows[row_key]:
                issues.append(f"Duplicate heatmap cell {row_key}/{col_key}")
            rows[row_key].add(col_key)

        column_count = len(columns)
        for row_key, row_columns in rows.items():
            if len(row_columns) != column_count:
                issues.append(f"Heatmap row {row_key} is missing one or more cohort columns")

    return issues


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
                "value": 0.75,
                "coverage": 0.95,
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
    assert _frontend_validate_heatmap(result) == []
    series = result["series"][0]
    assert result["chartType"] == "retention"
    assert series.get("unit") == "percentage"
    assert series["summary"]["cohorts"] == 2
    assert series["summary"]["lags"] == 2
    assert len(series["data"]) == 4
    # Ensure missing cohort/lag combinations are still represented with null values.
    assert any(point["value"] is None for point in series["data"] if point["group"] == "Week 1")
    assert all("rawCount" not in point for point in series["data"])


def test_retention_heatmap_all_time_range_fills_matrix():
    spec = _retention_spec()
    spec["timeWindow"] = {
        "from": "2023-01-01T00:00:00Z",
        "to": "2024-02-12T00:00:00Z",
        "bucket": "WEEK",
        "timezone": "UTC",
    }

    frame = pd.DataFrame(
        [
            {
                "measure_id": "retention_rate",
                "bucket_start": pd.Timestamp("2023-12-25T00:00:00Z"),
                "lag_weeks": 0,
                "value": 1.0,
                "coverage": 1.0,
            },
            {
                "measure_id": "retention_rate",
                "bucket_start": pd.Timestamp("2023-12-25T00:00:00Z"),
                "lag_weeks": 1,
                "value": 0.55,
                "coverage": 0.8,
            },
            {
                "measure_id": "retention_rate",
                "bucket_start": pd.Timestamp("2023-12-25T00:00:00Z"),
                "lag_weeks": 2,
                "value": 0.25,
                "coverage": 0.7,
            },
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
                "lag_weeks": 2,
                "value": 0.4,
                "coverage": 0.65,
            },
            {
                "measure_id": "retention_rate",
                "bucket_start": pd.Timestamp("2024-01-08T00:00:00Z"),
                "lag_weeks": 0,
                "value": 1.0,
                "coverage": 0.9,
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

    validate_chart_result(result)
    assert _frontend_validate_heatmap(result) == []
    series = result["series"][0]
    cohorts = {"2023-12-25T00:00:00Z", "2024-01-01T00:00:00Z", "2024-01-08T00:00:00Z"}
    groups = {"Week 0", "Week 1", "Week 2"}

    assert len(series["data"]) == len(cohorts) * len(groups)
    assert {point["x"] for point in series["data"]} == cohorts
    assert {point["group"] for point in series["data"]} == groups
    assert series["summary"]["cohorts"] == 3
    assert series["summary"]["lags"] == 3
    assert (
        next(
            (point for point in series["data"] if point["x"] == "2024-01-08T00:00:00Z" and point["group"] == "Week 1"),
            {},
        ).get("value")
        is None
    )
