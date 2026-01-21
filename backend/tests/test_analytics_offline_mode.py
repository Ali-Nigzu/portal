from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.fastapi_app import ANALYTICS_OFFLINE_MODE, app  # noqa: E402
from backend.app.analytics.contracts import validate_chart_result  # noqa: E402


@pytest.fixture(autouse=True)
def enable_offline_mode(monkeypatch):
    monkeypatch.setenv("ANALYTICS_OFFLINE_MODE", "true")
    # Ensure any cached module-level flag is refreshed for the app under test
    monkeypatch.setattr("backend.fastapi_app.ANALYTICS_OFFLINE_MODE", True, raising=False)
    yield
    monkeypatch.setattr("backend.fastapi_app.ANALYTICS_OFFLINE_MODE", ANALYTICS_OFFLINE_MODE, raising=False)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "project")
    monkeypatch.setenv("BQ_DATASET", "dataset")
    monkeypatch.setenv("BQ_LOCATION", "EU")
    client = TestClient(app)
    yield client


def _vrm_traffic_spec() -> dict:
    return {
        "id": "dashboard.kpi.vrm.traffic_distribution",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [{"id": "events", "label": "Events", "aggregation": "count"}],
        "dimensions": [
            {"id": "timestamp", "column": "timestamp", "bucket": "15_MIN", "sort": "asc"}
        ],
        "splits": [{"id": "camera_id", "column": "camera_id", "sort": "desc"}],
        "timeWindow": {
            "from": "{{NOW_MINUS_24_HOURS}}",
            "to": "{{NOW}}",
            "bucket": "15_MIN",
            "timezone": "UTC",
        },
    }


@pytest.mark.parametrize("endpoint", ["/analytics/run", "/api/analytics/run"])
def test_offline_mode_returns_fixture(client, endpoint):
    response = client.post(endpoint, json={"spec": _vrm_traffic_spec(), "orgId": "clientA"})
    assert response.status_code == 200
    payload = response.json()
    validate_chart_result(payload)
    assert payload["chartType"] == "composed_time"
    assert payload["series"]
    assert payload["series"][0]["data"]


@pytest.mark.anyio("asyncio")
async def test_startup_health_check_does_not_crash_offline(monkeypatch):
    # Simulate health check failure and assert that it does not propagate
    calls = {"count": 0}

    def _failing_health_check():
        calls["count"] += 1
        raise RuntimeError("no token")

    monkeypatch.setattr("backend.app.bigquery_client.bigquery_client.run_health_check", _failing_health_check)
    from backend.fastapi_app import startup_health_check  # noqa: WPS433

    # Should swallow the exception when offline mode is enabled
    await startup_health_check()
    assert calls["count"] == 0 or calls["count"] == 1

