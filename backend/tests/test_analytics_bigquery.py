import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

import base64
from typing import Any, Dict

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.fastapi_app import app, analytics_cache, bigquery_client


@pytest.fixture(autouse=True)
def mock_bigquery(monkeypatch):
    stats_df = pd.DataFrame([
        {
            "total_records": 100,
            "min_timestamp": pd.Timestamp("2024-01-01T00:00:00Z"),
            "max_timestamp": pd.Timestamp("2024-01-02T03:00:00Z"),
            "entries": 60,
            "exits": 40,
        }
    ])

    demographics_df = pd.DataFrame([
        {"sex": "male", "age_bucket": "25-34", "count": 30},
        {"sex": "female", "age_bucket": "18-24", "count": 20},
    ])

    hourly_df = pd.DataFrame([
        {"hour": 9, "count": 12},
        {"hour": 10, "count": 24},
        {"hour": 11, "count": 6},
    ])

    records_df = pd.DataFrame([
        {
            "track_id": "abc",
            "event": 1,
            "timestamp": pd.Timestamp("2024-01-02T02:15:00Z"),
            "sex": "male",
            "age_bucket": "25-34",
        },
        {
            "track_id": "xyz",
            "event": 0,
            "timestamp": pd.Timestamp("2024-01-02T01:45:00Z"),
            "sex": "female",
            "age_bucket": "18-24",
        },
    ])

    dwell_df = pd.DataFrame([
        {"avg_dwell_minutes": 12.5},
    ])

    search_results_df = pd.DataFrame([
        {
            "track_id": "abc",
            "event": 1,
            "timestamp": pd.Timestamp("2024-01-02T02:15:00Z"),
            "sex": "male",
            "age_bucket": "25-34",
        },
        {
            "track_id": "xyz",
            "event": 0,
            "timestamp": pd.Timestamp("2024-01-02T01:45:00Z"),
            "sex": "female",
            "age_bucket": "18-24",
        },
    ])

    def fake_query_dataframe(sql: str, params: Dict[str, Any], job_context: Any = None):
        if "COUNT(*) AS total_records" in sql:
            return stats_df
        if "GROUP BY sex, age_bucket" in sql:
            return demographics_df
        if "EXTRACT(HOUR FROM timestamp)" in sql:
            return hourly_df
        if "LIMIT 10000" in sql:
            return records_df
        if "avg_dwell_minutes" in sql:
            return dwell_df
        if "SELECT COUNT(*) AS total" in sql and "LIMIT @limit" not in sql:
            return pd.DataFrame([{"total": len(search_results_df)}])
        if "LIMIT @limit OFFSET @offset" in sql:
            offset = params.get('offset', 0)
            limit = params.get('limit', len(search_results_df))
            return search_results_df.iloc[offset:offset + limit]
        raise AssertionError(f"Unexpected SQL received: {sql}")

    monkeypatch.setattr(bigquery_client, "query_dataframe", fake_query_dataframe)
    monkeypatch.setattr(bigquery_client, "run_health_check", lambda: None)
    analytics_cache.clear()
    yield
    analytics_cache.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _auth_header(username: str, password: str) -> Dict[str, str]:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_chart_data_matches_expected_schema(client):
    response = client.get(
        "/api/chart-data",
        headers=_auth_header("client1", "client123"),
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["summary"]["total_records"] == 100
    assert payload["summary"]["date_range"]["start"].startswith("2024-01-01")
    assert payload["intelligence"]["avg_dwell_minutes"] == pytest.approx(12.5)
    assert payload["intelligence"]["demographics_breakdown"]["events"] == {
        "entry": 60,
        "exit": 40,
    }
    assert len(payload["data"]) == 2
    assert payload["data"][0]["event"] in {"entry", "exit"}


def test_search_events_returns_paginated_rows(client):
    response = client.get(
        "/api/search-events",
        headers=_auth_header("client1", "client123"),
        params={"page": 1, "per_page": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["total_pages"] == 2
    assert len(body["events"]) == 1
    assert body["events"][0]["track_number"] == "abc"
    assert body["events"][0]["event"] == "entry"
