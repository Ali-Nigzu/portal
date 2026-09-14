from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.demo_dashboard import router
from backend.app.services import dashboard_postgres
from backend.app.services.organisation_dashboard import (
    EntityNotFound, InvalidSnapshot, OrganisationDashboard, site_slugs,
)


def payload():
    def rollup(n):
        return dict(entrances=[10] * n, occupancy=[[2.5, 1, 4]] * n,
                    exits=[3] * n, age_pct=[10, 15, 20, 25, 20, 10], sex_pct=[60, 40])
    return dict(
        entrances_96=list(range(96)), occupancy_96=[2.5] * 96,
        exits_96=[3] * 96, footfall_96=[103] * 96, dwell_time_96=[120] * 96,
        traffic_devices=[dict(site_id=7, name="Production door")],
        traffic_split_96=[[100]] * 96, capacity=[[125, 150]] * 96,
        **{key: rollup(n) for key, n in (
            ("today", 13), ("yesterday", 24), ("week", 7), ("month", 4),
            ("quarter", 12), ("year", 12), ("all_time", 2))},
    )


class Database:
    def __init__(self, rows):
        self.rows = iter(rows)
        self.queries = []
        self.closed = 0

    @contextmanager
    def connection(self):
        yield self

    def cursor(self):
        return self

    def execute(self, sql, params):
        assert sql.startswith("SELECT ")
        assert "state" not in sql.lower()
        self.queries.append((sql, params))

    def fetchone(self):
        return next(self.rows)

    def fetchall(self):
        return next(self.rows)

    def close(self):
        self.closed += 1


def snapshot_row(data=None):
    return (1, "Relational name", datetime(2026, 9, 14, 12, 4, tzinfo=timezone.utc), data or payload())


def test_context_uses_relational_names_and_retains_enabled_flags():
    db = Database([(1, "Demo renamed", False), [(7, "Café", 1, False, 5), (8, "Cafe", 1, True, 10)]])
    context = OrganisationDashboard(db).load_organisation_context(1)
    assert context["organisation"] == dict(id="1", name="Demo renamed", enabled=False, slug="demo-renamed")
    assert len({s["slug"] for s in context["sites"]}) == 2
    assert context["sites"][0]["enabled"] is False
    assert all(params == (1,) for _, params in db.queries)
    renamed = site_slugs([dict(name="New third site")])
    assert renamed[0]["slug"] == "new-third-site"


def test_snapshot_is_canonical_and_preserves_values():
    db = Database([snapshot_row()])
    result = OrganisationDashboard(db).load_organisation_snapshot(1)
    assert result["scope"] == "organisation"
    assert result["payload"]["capacity"][95] == [125, 150]
    assert result["payload"]["today"]["occupancy"][0] == [2.5, 1, 4]
    assert result["payload"]["traffic_devices"][0]["site_id"] == "7"
    assert set(result) == {"scope", "entity_id", "entity_name", "ts", "payload"}
    assert db.closed == 1


def test_site_read_enforces_ownership_in_query():
    db = Database([None])
    with pytest.raises(EntityNotFound):
        OrganisationDashboard(db).load_site_snapshot(1, 999)
    assert "s.organisation_id = %s" in db.queries[0][0]
    assert db.queries[0][1] == (999, 1)


@pytest.mark.parametrize("change", [
    lambda p: [],
    lambda p: dict(p, entrances_96=[1] * 97),
    lambda p: dict(p, entrances_96=[1] * 95),
    lambda p: dict(p, capacity=[[0]] * 96),
    lambda p: dict(p, traffic_split_96=[[]] * 96),
    lambda p: dict(p, traffic_devices=[dict(device_id=1, name="Wrong scope")]),
    lambda p: dict(p, today=dict(p["today"], race_pct=[0, 0, 0])),
    lambda p: dict(p, today=dict(p["today"], age_pct=[0] * 5)),
    lambda p: dict(p, occupancy_96=[float("nan")] * 96),
])
def test_malformed_snapshot_is_rejected_without_repair(change):
    row = list(snapshot_row())
    row[3] = change(deepcopy(payload()))
    with pytest.raises(InvalidSnapshot):
        OrganisationDashboard(Database([row])).load_organisation_snapshot(1)


def api(reader):
    app = FastAPI()
    app.state.organisation_dashboard = reader
    app.include_router(router)
    return TestClient(app)


def test_public_api_ignores_auth_as_authority_and_pins_organisation():
    calls = []
    reader = SimpleNamespace(
        load_organisation_context=lambda org: calls.append(org) or {},
        load_organisation_snapshot=lambda org: calls.append(org) or {},
        load_site_snapshot=lambda org, site: calls.append((org, site)) or {},
    )
    client = api(reader)
    for url in ("context", "snapshot", "sites/8/snapshot"):
        response = client.get("/api/demo/dashboard/" + url, headers={"Authorization": "Basic anything", "X-Demo-Session": "999"})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
    assert calls == [1, 1, (1, 8)]
    for alias in ("org", "orgId", "organisation_id", "viewToken", "view_token", "siteView", "ts"):
        assert client.get(f"/api/demo/dashboard/snapshot?{alias}=999").status_code == 422
    for invalid in ("0", "-1", "1.2", "9223372036854775808", "1%20OR%201=1"):
        assert client.get(f"/api/demo/dashboard/sites/{invalid}/snapshot").status_code == 422
    assert calls == [1, 1, (1, 8)]


def test_storage_failure_never_exposes_key_path_or_exception_text():
    def fail(org):
        raise RuntimeError("private_key /secret/sa.json")
    response = api(SimpleNamespace(load_organisation_snapshot=fail)).get("/api/demo/dashboard/snapshot")
    assert response.status_code == 503
    assert "private_key" not in response.text and "sa.json" not in response.text


def test_connector_uses_root_credentials_and_iam_without_password(monkeypatch, tmp_path):
    calls = {}
    class Connector:
        def __init__(self, **kwargs):
            calls["connector"] = kwargs
        def connect(self, *args, **kwargs):
            calls["connect"] = (args, kwargs)
            return SimpleNamespace(autocommit=False, close=lambda: calls.update(closed=True))
        def close(self):
            calls["connector_closed"] = True
    def credentials(path):
        calls["path"] = path
        return SimpleNamespace(service_account_email="portal-reader@camosbase.iam.gserviceaccount.com")
    monkeypatch.setattr(dashboard_postgres, "Connector", Connector)
    monkeypatch.setattr(dashboard_postgres.service_account.Credentials, "from_service_account_file", credentials)
    monkeypatch.chdir(tmp_path)
    db = dashboard_postgres.DashboardPostgres()
    assert not calls
    with db.connection() as connection:
        assert connection.autocommit is True
    db.close()
    args, kwargs = calls["connect"]
    assert args == ("camosbase:europe-west2:camos-prod-postgres", "pg8000")
    assert kwargs["user"] == "portal-reader@camosbase.iam"
    assert kwargs["db"] == "camos_prod" and kwargs["enable_iam_auth"] is True
    assert "password" not in kwargs
    assert calls["path"] == str(dashboard_postgres.APPLICATION_ROOT / "sa.json")
    assert calls["closed"] and calls["connector_closed"]
