from datetime import datetime, timezone
from pathlib import Path
import sys

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.fastapi_app import app, analytics_spec_cache
from backend.app.bigquery_client import bigquery_client


@pytest.fixture(autouse=True)
def clear_analytics_cache():
    analytics_spec_cache.clear()
    yield
    analytics_spec_cache.clear()


@pytest.fixture
def client(monkeypatch):
    def fake_load_users():
        return {"client0": {"table_name": "project.dataset.client0"}}

    monkeypatch.setattr("backend.app.database.load_users", fake_load_users)
    monkeypatch.setattr("backend.fastapi_app.load_users", fake_load_users)

    calls = {"count": 0}

    def fake_query_dataframe(sql: str, params: dict, job_context: str | None = None):
        calls["count"] += 1
        return pd.DataFrame(
            [
                {
                    "measure_id": "activity",
                    "bucket_start": pd.Timestamp(
                        datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc)
                    ),
                    "value": 12.0,
                    "coverage": 1.0,
                    "raw_count": 12,
                }
            ]
        )

    monkeypatch.setattr(bigquery_client, "query_dataframe", fake_query_dataframe)
    client = TestClient(app)
    yield client, calls


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
    }


@pytest.mark.parametrize("endpoint", ["/analytics/run", "/api/analytics/run"])
def test_analytics_run_endpoint_executes_spec(client, endpoint):
    http_client, calls = client
    response = http_client.post(endpoint, json={"spec": _build_spec(), "orgId": "client0"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["chartType"] == "composed_time"
    assert payload["series"][0]["data"][0]["y"] == pytest.approx(12.0)
    assert calls["count"] == 1
@pytest.mark.parametrize("endpoint", ["/analytics/run", "/api/analytics/run"])
def test_analytics_run_endpoint_rejects_wrong_method(client, endpoint):
    http_client, _ = client
    response = http_client.get(endpoint)
    assert response.status_code == 405
