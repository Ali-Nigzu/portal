import base64
import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.append(str(Path(__file__).resolve().parents[2]))

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.app.analytics import org_config
from backend.app.bigquery_client import bigquery_client
from backend.fastapi_app import analytics_spec_cache, app


@pytest.fixture(autouse=True)
def clear_cache():
    analytics_spec_cache.clear()
    yield
    analytics_spec_cache.clear()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "nigzsu")
    monkeypatch.setenv("BQ_DATASET", "demodata0")
    original_map = dict(org_config.ORG_TABLE_MAP)
    org_config.override_org_table_map(org_config.build_org_table_map())

    calls: dict[str, int] = {"count": 0}

    def fake_query_dataframe(sql: str, params: dict, job_context: str | None = None):
        calls["count"] += 1
        return pd.DataFrame(
            [
                {
                    "measure_id": "activity",
                    "bucket_start": pd.Timestamp(
                        datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc)
                    ),
                    "value": 1.0,
                    "coverage": 1.0,
                    "raw_count": 1,
                }
            ]
        )

    monkeypatch.setattr(bigquery_client, "query_dataframe", fake_query_dataframe)
    client = TestClient(app)
    try:
        yield client, calls
    finally:
        org_config.override_org_table_map(original_map)


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


def test_analytics_run_honours_view_token_flow(client):
    http_client, calls = client

    # Admin-style auth used by the dashboard flow
    auth_header = "Basic " + base64.b64encode(b"admin:admin123").decode("ascii")

    # Create a view token for client1 (maps to client0 org via table_name)
    token_response = http_client.post(
        "/api/admin/create-view-token", json={"client_id": "client1"}, headers={"Authorization": auth_header}
    )
    assert token_response.status_code == 200
    token = token_response.json()["token"]

    # Use the same auth context and view token to run analytics
    response = http_client.post(
        "/api/analytics/run",
        json={"spec": _build_spec(), "viewToken": token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["chartType"] == "composed_time"
    assert payload["series"][0]["data"][0]["y"] == pytest.approx(1.0)
    assert calls["count"] == 1
