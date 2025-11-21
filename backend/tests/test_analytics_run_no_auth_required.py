from datetime import datetime, timezone
from pathlib import Path
import sys

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.fastapi_app import app, analytics_spec_cache
from backend.app.analytics import org_config
from backend.app.bigquery_client import bigquery_client


@pytest.fixture(autouse=True)
def clear_cache():
    analytics_spec_cache.clear()
    yield
    analytics_spec_cache.clear()


def _build_spec() -> dict:
    return {
        "id": "spec_live_flow",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [
            {"id": "activity", "label": "Activity", "aggregation": "count"},
        ],
        "dimensions": [
            {"id": "timestamp", "column": "timestamp", "bucket": "HOUR", "sort": "asc"}
        ],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-01T03:00:00Z",
            "bucket": "HOUR",
            "timezone": "UTC",
        },
        "series": [
            {
                "id": "activity",
                "label": "Entrances",
                "measure": {"id": "activity"},
                "dimension": {"id": "timestamp"},
            }
        ],
    }


def test_analytics_run_allows_dev_requests_without_auth(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "project")
    monkeypatch.setenv("BQ_DATASET", "dataset")

    original_map = dict(org_config.ORG_TABLE_MAP)
    org_config.override_org_table_map({"client0": "client0"})

    def fake_query_dataframe(sql: str, params: dict, job_context: str | None = None):
        return pd.DataFrame(
            [
                {
                    "measure_id": "activity",
                    "bucket_start": pd.Timestamp(
                        datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc)
                    ),
                    "value": 4.0,
                    "coverage": 1.0,
                    "raw_count": 4,
                }
            ]
        )

    monkeypatch.setattr(bigquery_client, "query_dataframe", fake_query_dataframe)
    client = TestClient(app)

    try:
        response = client.post("/api/analytics/run", json={"spec": _build_spec()})
        assert response.status_code != 401
        payload = response.json()
        assert payload["chartType"] == "composed_time"
        assert payload["series"][0]["data"][0]["y"] == pytest.approx(4.0)
    finally:
        org_config.override_org_table_map(original_map)
