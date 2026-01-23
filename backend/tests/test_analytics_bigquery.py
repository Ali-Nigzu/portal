import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

import base64
from typing import Any, Dict

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.fastapi_app import app, analytics_cache, bigquery_client
from backend.app.analytics.org_config import resolve_table_for_org


@pytest.fixture(autouse=True)
def mock_bigquery(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "project")
    monkeypatch.setenv("BQ_DATASET", "dataset")
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

    hourly_contract_df = pd.DataFrame([
        {
            "measure_id": "activity_total",
            "bucket_start": pd.Timestamp("2024-01-01T09:00:00Z"),
            "hour": 9,
            "count": 12,
            "value": 12,
            "coverage": 1.0,
            "raw_count": 12,
        },
        {
            "measure_id": "activity_total",
            "bucket_start": pd.Timestamp("2024-01-01T10:00:00Z"),
            "hour": 10,
            "count": 24,
            "value": 24,
            "coverage": 1.0,
            "raw_count": 24,
        },
        {
            "measure_id": "activity_total",
            "bucket_start": pd.Timestamp("2024-01-01T11:00:00Z"),
            "hour": 11,
            "count": 6,
            "value": 6,
            "coverage": 1.0,
            "raw_count": 6,
        },
    ])

    records_df = pd.DataFrame([
        {
            "track_id": "ABC12",
            "event": 1,
            "timestamp": pd.Timestamp("2024-01-02T02:15:00Z"),
            "sex": "M",
            "age_bucket": "0-4",
        },
        {
            "track_id": "xyz",
            "event": 0,
            "timestamp": pd.Timestamp("2024-01-02T01:45:00Z"),
            "sex": "F",
            "age_bucket": "14-25",
        },
    ])

    dwell_contract_df = pd.DataFrame([
        {
            "measure_id": "avg_dwell",
            "bucket_start": pd.Timestamp("2024-01-01T09:00:00Z"),
            "value": 12.5,
            "coverage": 1.0,
            "raw_count": 10,
        }
    ])

    def _apply_track_filter(df: pd.DataFrame, params: Dict[str, Any]) -> pd.DataFrame:
        track_like = params.get("track_like")
        if not track_like:
            return df
        needle = str(track_like).strip("%")
        return df[df["track_id"].str.contains(needle, case=False, na=False)]

    def _apply_sex_filter(df: pd.DataFrame, params: Dict[str, Any]) -> pd.DataFrame:
        sexes = params.get("sex_filters")
        if not sexes:
            return df
        return df[df["sex"].isin(sexes)]

    def _apply_age_filter(df: pd.DataFrame, params: Dict[str, Any]) -> pd.DataFrame:
        ages = params.get("age_filters")
        if not ages:
            return df
        return df[df["age_bucket"].isin(ages)]

    def fake_query_dataframe(sql: str, params: Dict[str, Any], job_context: Any = None):
        if "COUNT(*) AS total_records" in sql:
            filtered_records = _apply_track_filter(records_df, params)
            filtered_records = _apply_sex_filter(filtered_records, params)
            filtered_records = _apply_age_filter(filtered_records, params)
            if job_context and "search_summary" in str(job_context):
                entrances = int((filtered_records["event"] == 1).sum())
                exits = int((filtered_records["event"] == 0).sum())
                return pd.DataFrame(
                    [
                        {
                            "total_records": len(filtered_records),
                            "min_timestamp": filtered_records["timestamp"].min(),
                            "max_timestamp": filtered_records["timestamp"].max(),
                            "entrances": entrances,
                            "exits": exits,
                        }
                    ]
                )
            return stats_df
        if "GROUP BY sex, age_bucket" in sql:
            return demographics_df
        if "activity_total_activity_series" in sql:
            return hourly_contract_df
        if "EXTRACT(HOUR FROM timestamp) AS hour" in sql:
            return hourly_contract_df
        if "LIMIT @limit" in sql and "OFFSET @offset" in sql:
            offset = int(params.get('offset', 0) or 0)
            limit = int(params.get('limit', len(records_df)))
            filtered_records = _apply_track_filter(records_df, params)
            filtered_records = _apply_sex_filter(filtered_records, params)
            filtered_records = _apply_age_filter(filtered_records, params)
            return filtered_records.iloc[offset:offset + limit]
        if "dwell_minutes" in sql:
            return dwell_contract_df
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
    assert resolve_table_for_org("client1") == "camosbase.sitedemodata.logs"
    assert resolve_table_for_org("client2") == "camosbase.sitedemodata.logs"

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
    assert body["events"][0]["track_number"] == "ABC12"
    assert body["events"][0]["event"] == "entry"


def test_search_events_track_id_sanitization_matches(client):
    response = client.get(
        "/api/search-events",
        headers=_auth_header("client1", "client123"),
        params={"track_id": "ab12"},
    )
    response_hash = client.get(
        "/api/search-events",
        headers=_auth_header("client1", "client123"),
        params={"track_id": "#Ab12"},
    )

    assert response.status_code == 200
    assert response_hash.status_code == 200

    body = response.json()
    body_hash = response_hash.json()
    assert body["total"] == 1
    assert body_hash["total"] == 1
    assert body["events"][0]["track_number"] == "ABC12"
    assert body_hash["events"][0]["track_number"] == "ABC12"


def test_search_events_sex_filter(client):
    response_male = client.get(
        "/api/search-events",
        headers=_auth_header("client1", "client123"),
        params={"sex": "M"},
    )
    response_female = client.get(
        "/api/search-events",
        headers=_auth_header("client1", "client123"),
        params={"sex": "F"},
    )

    assert response_male.status_code == 200
    assert response_female.status_code == 200

    body_male = response_male.json()
    body_female = response_female.json()
    assert body_male["total"] == 1
    assert body_female["total"] == 1
    assert body_male["events"][0]["sex"] == "M"
    assert body_female["events"][0]["sex"] == "F"


def test_search_events_age_filter(client):
    response_age = client.get(
        "/api/search-events",
        headers=_auth_header("client1", "client123"),
        params={"age": "0"},
    )
    response_age_label = client.get(
        "/api/search-events",
        headers=_auth_header("client1", "client123"),
        params={"age": "14-25"},
    )

    assert response_age.status_code == 200
    assert response_age_label.status_code == 200

    body_age = response_age.json()
    body_label = response_age_label.json()
    assert body_age["total"] == 1
    assert body_label["total"] == 1
    assert body_age["events"][0]["age_estimate"] == "0-4"
    assert body_label["events"][0]["age_estimate"] == "14-25"
