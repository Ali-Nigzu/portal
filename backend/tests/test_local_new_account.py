from contextlib import contextmanager
import csv
import io

import pytest
from fastapi.testclient import TestClient

from backend.tests.support.portal_factory import create_fixture_app
from backend.app.services.organisation_dashboard import (
    EntityNotFound,
    OrganisationDashboard,
    build_zero_organisation_snapshot,
)
from backend.app.services.portal_alarms import AlarmLogs
from backend.app.services.portal_context import PortalIdentity, PortalScope
from backend.app.services.portal_devices import PortalDevices
from backend.app.services.portal_events import EventLogs


USER_ID = 900000000000000001
ORGANISATION_ID = 900000000000000101


def assert_all_zero(value):
    if isinstance(value, dict):
        for child in value.values():
            assert_all_zero(child)
    elif isinstance(value, list):
        for child in value:
            assert_all_zero(child)
    elif isinstance(value, (int, float)):
        assert value == 0


def test_zero_dashboard_factory_has_complete_non_persisted_contract():
    snapshot = build_zero_organisation_snapshot(
        ORGANISATION_ID, "My Org"
    )
    payload = snapshot["payload"]
    assert set(snapshot) == {"scope", "entity_id", "entity_name", "ts", "payload"}
    assert snapshot["scope"] == "organisation"
    assert snapshot["entity_id"] == str(ORGANISATION_ID)
    assert snapshot["entity_name"] == "My Org"
    assert len(payload["entrances_96"]) == 96
    assert len(payload["occupancy_96"]) == 96
    assert len(payload["traffic_split_96"]) == 96
    assert len(payload["capacity"]) == 96
    assert payload["occupancy_96"] == [[0, 0, 0]] * 96
    assert payload["capacity"] == [[0, 0]] * 96
    assert payload["traffic_devices"] == []
    assert payload["traffic_split_96"] == [[] for _ in range(96)]
    assert set(payload) == {
        "entrances_96", "occupancy_96", "exits_96", "footfall_96",
        "dwell_time_96", "traffic_devices", "traffic_split_96", "capacity",
        "today", "yesterday", "week", "month", "quarter", "year", "all_time",
    }
    for period in ("today", "yesterday", "week", "month", "quarter", "year", "all_time"):
        assert len(payload[period]["age_pct"]) == 6
        assert len(payload[period]["sex_pct"]) == 2
        assert all(len(item) == 3 for item in payload[period]["occupancy"])
    assert_all_zero(payload)


class RowsDatabase:
    def __init__(self, rows):
        self.rows = iter(rows)

    @contextmanager
    def connection(self):
        yield self

    def cursor(self):
        return self

    def execute(self, _sql, _params):
        pass

    def fetchone(self):
        return next(self.rows)

    def fetchall(self):
        return next(self.rows)

    def close(self):
        pass


def test_live_reader_only_synthesizes_for_existing_zero_site_organisation():
    reader = OrganisationDashboard(RowsDatabase([None, (7, "Empty", True), []]))
    result = reader.load_organisation_snapshot(7)
    assert result["entity_name"] == "Empty"
    assert result["payload"]["entrances_96"] == [0] * 96

    with pytest.raises(EntityNotFound):
        OrganisationDashboard(
            RowsDatabase([None, (7, "Has a Site", True), [(8, "Site", 7, True, 10, False)]])
        ).load_organisation_snapshot(7)


class Forbidden:
    def connection(self):
        raise AssertionError("database touched")

    def portal_rows(self, *_args, **_kwargs):
        raise AssertionError("BigQuery touched")


def zero_scope():
    context = {
        "organisation": {"id": "7", "name": "Empty"},
        "sites": [], "sources": [],
        "clock": {"effective_now": "2026-10-03T00:00:00+00:00"},
    }
    return PortalScope(PortalIdentity(7), context, {}, None, [])


def test_zero_site_services_return_empty_without_external_access():
    forbidden = Forbidden()
    scope = zero_scope()
    events = EventLogs(forbidden)
    assert events.search(scope, {}) == {
        "scope": {"organisation_id": "7", "site_id": None},
        "effective_now": None,
        "items": [], "total": 0,
        "page": {"size": 20, "next_cursor": None},
    }
    exported = "".join(events.export(scope, {}))
    assert list(csv.reader(io.StringIO(exported))) == [[
        "Event ID", "Site", "Source", "Event Type", "Timestamp", "Sex", "Age"
    ]]
    alarms = AlarmLogs(forbidden).search(scope, {})
    assert alarms["counts"] == {"active": 0, "cleared": 0}
    assert alarms["active"]["items"] == []
    assert alarms["cleared"] == {"items": [], "next_cursor": None, "has_more": False}
    assert PortalDevices(forbidden, forbidden).read(scope) == {
        "scope": {"organisation_id": "7", "site_id": None},
        "records_status": "available", "items": [],
    }


@pytest.fixture
def local_client(monkeypatch):
    monkeypatch.setenv("PORTAL_SESSION_SECRET", "local-development-secret-value-123456789")
    monkeypatch.delenv("NODE_ENV", raising=False)
    with TestClient(create_fixture_app(), headers={"X-Requested-With": "camOS"}) as client:
        yield client


def test_local_mode_uses_normal_auth_session_catalogue_and_context(local_client):
    assert local_client.post("/api/login", json={"identifier": "missing", "password": "test"}).status_code == 401
    assert local_client.post("/api/login", json={"identifier": "test", "password": "wrong"}).status_code == 401
    response = local_client.post("/api/login", json={"identifier": "test", "password": "test"})
    assert response.status_code == 200
    assert response.json()["user"] == {
        "id": str(USER_ID), "name": "Test User",
        "email": "test@local.invalid", "phone": None,
    }
    assert "camos_session" in response.cookies
    assert "demo" not in response.headers.get("set-cookie", "").lower()
    assert local_client.get("/api/me").json()["user"]["name"] == "Test User"
    assert local_client.get("/api/portal/organisations").json() == {
        "organisations": [{
            "id": str(ORGANISATION_ID), "name": "My Org", "role": 0, "sites": [],
        }]
    }
    base = f"/api/portal/organisations/{ORGANISATION_ID}"
    context = local_client.get(base + "/context").json()
    assert context["organisation"]["name"] == "My Org"
    assert context["sites"] == [] and context["sources"] == []
    assert context["clock"]["effective_now"] == context["clock"]["server_now"]
    assert context["membership"] == {"role": 0}

    snapshot = local_client.get(base + "/snapshot")
    assert snapshot.status_code == 200
    assert snapshot.json()["payload"]["occupancy_96"] == [[0, 0, 0]] * 96
    assert local_client.get(base + "/events").json()["total"] == 0
    assert local_client.get(base + "/alarms").json()["counts"] == {"active": 0, "cleared": 0}
    assert local_client.get(base + "/devices").json()["items"] == []
    report = local_client.get(base + "/reports/snapshot")
    assert report.status_code == 200
    assert report.json()["scope"] == {"organisation_id": str(ORGANISATION_ID), "site_id": None}
    assert report.json()["snapshot"]["entity_name"] == "My Org"
    assert_all_zero(report.json()["snapshot"]["payload"])
    assert local_client.get(base + "/reports/snapshot?site_id=123").status_code == 404
    assert local_client.get(base + "/sites/123/snapshot").status_code == 404
    assert local_client.get(base + "/events?site_id=123").status_code == 404
    assert local_client.get("/api/documents").json() == {"documents": []}


def test_local_mode_is_forbidden_in_production(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "production")
    with pytest.raises(RuntimeError, match="forbidden in production"):
        create_fixture_app()
