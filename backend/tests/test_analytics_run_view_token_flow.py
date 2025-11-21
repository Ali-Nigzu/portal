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

    user_store = {
        "admin": {
            "password": "admin123",
            "role": "admin",
            "name": "Admin",
            "data_sources": [],
            "last_login": None,
        },
        "client1": {
            "password": "client123",
            "role": "client",
            "name": "Client 1",
            "table_name": "nigzsu.demodata0.client0_compat",
            "data_sources": [],
            "last_login": None,
        },
    }

    calls: dict[str, int] = {"count": 0}
    resolved: dict[str, str] = {}

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

    def fake_load_users():
        return user_store

    def fake_save_users(users):
        user_store.update(users)

    original_resolve = org_config.resolve_table_for_org

    def capture_resolve(org_id: str) -> str:
        table_name = original_resolve(org_id)
        resolved["table"] = table_name
        resolved["org"] = org_id
        return table_name

    monkeypatch.setattr(bigquery_client, "query_dataframe", fake_query_dataframe)
    monkeypatch.setattr("backend.fastapi_app.load_users", fake_load_users)
    monkeypatch.setattr("backend.fastapi_app.save_users", fake_save_users)
    monkeypatch.setattr(org_config, "resolve_table_for_org", capture_resolve)
    monkeypatch.setattr("backend.fastapi_app.resolve_table_for_org", capture_resolve)

    client = TestClient(app)
    try:
        yield client, calls, resolved
    finally:
        org_config.override_org_table_map(original_map)
        monkeypatch.setattr(org_config, "resolve_table_for_org", original_resolve)
        monkeypatch.setattr("backend.fastapi_app.resolve_table_for_org", original_resolve)


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
    http_client, calls, resolved = client

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
    assert resolved["table"].endswith(".client0")
