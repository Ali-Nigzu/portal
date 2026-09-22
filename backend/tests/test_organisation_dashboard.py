from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import sqlite3
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
        return dict(entrances=[10] * n, occupancy=[[3, 1, 4] for _ in range(n)],
                    exits=[3] * n, age_pct=[10, 15, 20, 25, 20, 10], sex_pct=[60, 40])
    return dict(
        entrances_96=list(range(96)),
        occupancy_96=[[index + 2, index + 1, index + 3] for index in range(96)],
        exits_96=[3] * 96, footfall_96=[103] * 96, dwell_time_96=[20] * 96,
        traffic_devices=[dict(site_id=7, name="Production door")],
        traffic_split_96=[[100] for _ in range(96)], capacity=[[125, 150] for _ in range(96)],
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
    return (1, "Relational name", datetime(2026, 9, 14, 12, 4, tzinfo=timezone.utc),
            payload() if data is None else data)


def test_context_uses_relational_names_and_retains_enabled_flags():
    db = Database([(1, "Demo renamed", False), [(7, "Café", 1, False, 5, True), (8, "Cafe", 1, True, 10, False)]])
    context = OrganisationDashboard(db).load_organisation_context(1)
    assert context["organisation"] == dict(id="1", name="Demo renamed", enabled=False, slug="demo-renamed", realtime=True)
    assert len({s["slug"] for s in context["sites"]}) == 2
    assert context["sites"][0]["enabled"] is False
    assert all(params == (1,) for _, params in db.queries)
    renamed = site_slugs([dict(name="New third site")])
    assert renamed[0]["slug"] == "new-third-site"


class RelationalDatabase(Database):
    """Execute the service SELECTs against isolated rows and a frozen SQL clock.

    SQLite only substitutes PostgreSQL's interval syntax and placeholders;
    EXISTS, >=, ownership and joins are executed, not mocked as booleans.
    This is not a production PostgreSQL integration test.
    """
    now = datetime(2026, 9, 19, 12, 0, 0)

    def __init__(self, sites, devices, organisation_enabled=True):
        super().__init__([])
        self.db = sqlite3.connect(":memory:")
        self.db.create_function("current_timestamp", 0, lambda: self.now.isoformat(" "))
        self.db.executescript("""
            ATTACH DATABASE ':memory:' AS public;
            CREATE TABLE public.organisations (id, name, enabled);
            CREATE TABLE public.sites (id, name, organisation_id, enabled, max_capacity);
            CREATE TABLE public.devices (site_id, analyzed_until, enabled);
        """)
        self.db.execute("INSERT INTO public.organisations VALUES (1, 'Demo', ?)", (organisation_enabled,))
        self.db.executemany("INSERT INTO public.sites VALUES (?, ?, ?, ?, ?)", sites)
        self.db.executemany("INSERT INTO public.devices VALUES (?, ?, ?)", [
            (site, (self.now - timedelta(minutes=age)).isoformat(" ") if age is not None else None, enabled)
            for site, age, enabled in devices
        ])

    def execute(self, sql, params):
        super().execute(sql, params)
        sql = sql.replace("CURRENT_TIMESTAMP - INTERVAL '15 minutes'", "datetime(CURRENT_TIMESTAMP, '-15 minutes')")
        self.result = self.db.execute(sql.replace("%s", "?"), params)

    def fetchone(self):
        return self.result.fetchone()

    def fetchall(self):
        return self.result.fetchall()


@pytest.mark.parametrize("devices,site_enabled,expected", [
    ([(7, 5, True)], True, True),
    ([(7, 15, True)], True, True),
    ([(7, 16, True)], True, False),
    ([(7, 16, True), (7, 5, True)], True, True),
    ([(7, 16, True), (7, 30, True)], True, False),
    ([(7, None, True)], True, False),
    ([], True, False),
    ([(7, 5, False)], True, True),
    ([(7, 5, True)], False, True),
    ([(8, 5, True)], True, False),
], ids=["fresh", "inclusive-15-minutes", "stale", "mixed", "all-stale", "null", "no-devices",
        "disabled-device-fresh", "disabled-site-fresh", "foreign-site-fresh"])
def test_context_realtime_executes_frozen_clock_query(devices, site_enabled, expected):
    db = RelationalDatabase([(7, "Owned", 1, site_enabled, 10), (8, "Foreign", 2, True, 10)], devices)
    try:
        context = OrganisationDashboard(db).load_organisation_context(1)
        assert [site["id"] for site in context["sites"]] == ["7"]
        assert context["sites"][0]["realtime"] is expected
        assert context["sites"][0]["enabled"] == site_enabled
        assert context["organisation"]["realtime"] is expected
        assert context["organisation"]["enabled"] == True
        assert len(db.queries) == 2
        assert "d.analyzed_until >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'" in db.queries[1][0]
        assert "d.enabled" not in db.queries[1][0]
        assert "gateway" not in db.queries[1][0]
    finally:
        db.db.close()


@pytest.mark.parametrize("sites,devices,expected", [
    ([(7, "One", 1, True, 10), (8, "Two", 1, False, 10)], [(7, 30, True), (8, 5, False)], True),
    ([(7, "One", 1, True, 10), (8, "Two", 1, True, 10)], [(7, 30, True)], False),
    ([], [], False),
], ids=["one-fresh-owned-site", "all-offline", "no-sites"])
def test_organisation_realtime_is_any_owned_site_independent_of_enabled(sites, devices, expected):
    db = RelationalDatabase(sites, devices, organisation_enabled=False)
    try:
        context = OrganisationDashboard(db).load_organisation_context(1)
        assert context["organisation"]["realtime"] is expected
        assert context["organisation"]["enabled"] == False
        assert len(db.queries) == 2, "No per-site device queries"
    finally:
        db.db.close()


def test_missing_devices_permission_returns_sanitized_context_error():
    def fail(org):
        raise RuntimeError('permission denied for table devices: private credentials')
    response = api(SimpleNamespace(load_organisation_context=fail)).get("/api/demo/dashboard/context")
    assert response.status_code == 503
    assert "permission denied" not in response.text and "credentials" not in response.text


def test_snapshot_preserves_canonical_integer_occupancy_triples():
    db = Database([snapshot_row()])
    result = OrganisationDashboard(db).load_organisation_snapshot(1)
    assert result["scope"] == "organisation"
    assert result["payload"]["occupancy_96"][0] == [2, 1, 3]
    assert result["payload"]["occupancy_96"][95] == [97, 96, 98]
    assert result["payload"]["today"]["occupancy"][0] == [3, 1, 4]
    assert result["payload"]["capacity"][95] == [125, 150]
    assert result["payload"]["dwell_time_96"][95] == 20
    assert isinstance(result["payload"]["occupancy_96"][0][0], int)
    assert isinstance(result["payload"]["capacity"][95][0], int)
    assert isinstance(result["payload"]["dwell_time_96"][95], int)
    assert result["payload"]["traffic_devices"][0]["site_id"] == 7
    assert set(result) == {"scope", "entity_id", "entity_name", "ts", "payload"}
    assert db.closed == 1


def test_site_read_enforces_ownership_in_query():
    db = Database([None])
    with pytest.raises(EntityNotFound):
        OrganisationDashboard(db).load_site_snapshot(1, 999)
    assert "s.organisation_id = %s" in db.queries[0][0]
    assert db.queries[0][1] == (999, 1)


@pytest.mark.parametrize("bad_payload", [None, [], "not-json-object"])
def test_genuinely_unmappable_snapshot_rows_are_rejected(bad_payload):
    row = list(snapshot_row())
    row[3] = bad_payload
    with pytest.raises(InvalidSnapshot):
        OrganisationDashboard(Database([row])).load_organisation_snapshot(1)


def api(reader):
    app = FastAPI()
    app.state.organisation_dashboard = reader
    app.include_router(router)
    return TestClient(app)


def test_public_api_accepts_canonical_snapshots_and_pins_organisation():
    calls = []
    canonical = dict(scope="organisation", entity_id="1", entity_name="Demo",
                     ts="2026-09-17T17:07:07+00:00", payload=payload())
    reader = SimpleNamespace(
        load_organisation_context=lambda org: calls.append(org) or {},
        load_organisation_snapshot=lambda org: calls.append(org) or canonical,
        load_site_snapshot=lambda org, site: calls.append((org, site)) or dict(canonical, scope="site", entity_id=str(site)),
    )
    client = api(reader)
    for url in ("context", "snapshot", "sites/8/snapshot"):
        response = client.get("/api/demo/dashboard/" + url, headers={"Authorization": "Basic anything", "X-Demo-Session": "999"})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/demo/dashboard/snapshot").json()["payload"]["occupancy_96"][0] == [2, 1, 3]
    assert calls == [1, 1, (1, 8), 1]
    for alias in ("org", "orgId", "organisation_id", "viewToken", "view_token", "siteView", "ts"):
        assert client.get(f"/api/demo/dashboard/snapshot?{alias}=999").status_code == 422
    for invalid in ("0", "-1", "1.2", "9223372036854775808", "1%20OR%201=1"):
        assert client.get(f"/api/demo/dashboard/sites/{invalid}/snapshot").status_code == 422
    assert calls == [1, 1, (1, 8), 1]


def test_storage_failure_never_exposes_key_path_or_exception_text():
    def fail(org):
        raise RuntimeError("private_key /secret/sa.json")
    response = api(SimpleNamespace(load_organisation_snapshot=fail)).get("/api/demo/dashboard/snapshot")
    assert response.status_code == 503
    assert "private_key" not in response.text and "sa.json" not in response.text


def test_connector_uses_adc_pool_and_iam_without_password(monkeypatch, tmp_path):
    calls = {}
    class Connector:
        def __init__(self, **kwargs):
            calls["connector"] = kwargs
        def connect(self, *args, **kwargs):
            calls["connect"] = (args, kwargs)
            calls["connections"] = calls.get("connections", 0) + 1
            return SimpleNamespace(autocommit=False, rollback=lambda: None, close=lambda: calls.update(closed=True))
        def close(self):
            calls["connector_closed"] = True
    monkeypatch.setattr(dashboard_postgres, "Connector", Connector)
    monkeypatch.chdir(tmp_path)
    db = dashboard_postgres.DashboardPostgres()
    assert not calls
    with db.connection() as connection:
        assert connection.autocommit is True
    with db.connection():
        pass
    assert calls["connections"] == 1
    db.close()
    args, kwargs = calls["connect"]
    assert args == ("camosbase:europe-west2:camos-prod-postgres", "pg8000")
    assert kwargs["user"] == "portal-reader@camosbase.iam"
    assert kwargs["db"] == "camos_prod" and kwargs["enable_iam_auth"] is True
    assert "password" not in kwargs
    assert "credentials" not in calls["connector"]
    assert calls["closed"] and calls["connector_closed"]
