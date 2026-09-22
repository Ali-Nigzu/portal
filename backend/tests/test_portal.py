from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import portal
from backend.app.services.portal_context import (
    PortalIdentity,
    PortalScope,
    date_filters,
    encode_cursor,
    decode_cursor,
    query_key,
)
from backend.app.services.portal_events import (
    EventLogs,
    InvalidEventData,
    enum,
    EVENTS,
    SEXES,
)
from backend.app.services.portal_alarms import AlarmLogs
from backend.app.services.organisation_dashboard import EntityNotFound

NOW = datetime(2026, 9, 20, 12, tzinfo=timezone.utc)


class Metadata:
    def load(self, identity):
        return {
            "organisation": {"id": str(identity.organisation_id)},
            "sites": [
                {"id": "11", "name": "Renamed One"},
                {"id": "22", "name": "Renamed Two"},
                {"id": "9007199254740993", "name": "No gateway"},
            ],
            "sources": [
                {
                    "ref": "device:101",
                    "kind": "device",
                    "site_id": "11",
                    "label": "Front Door",
                },
                {
                    "ref": "gateway:11",
                    "kind": "gateway",
                    "site_id": "11",
                    "label": "Gateway 11",
                },
                {
                    "ref": "device:202",
                    "kind": "device",
                    "site_id": "22",
                    "label": "Front Door",
                },
            ],
        }, {"gateway:11": "private-gateway-uuid"}


def scope(site=None, sources=(), cutoff=NOW):
    return PortalScope.resolve(PortalIdentity(77, cutoff), Metadata(), site, sources)


@pytest.mark.parametrize(
    "site,refs",
    [
        ("99", []),
        ("11", ["device:202"]),
        (None, ["device:999"]),
        (None, ["gateway:22"]),
    ],
)
def test_scope_rejects_foreign_entities(site, refs):
    with pytest.raises(EntityNotFound):
        scope(site, refs)


def test_large_ids_and_missing_gateway():
    assert scope("9007199254740993").site_id == "9007199254740993"
    assert scope().dto == {"organisation_id": "77", "site_id": None}


@pytest.mark.parametrize(
    "value,options,label",
    [
        (0, EVENTS, "Exit"),
        (1, EVENTS, "Entrance"),
        (0, SEXES, "Male"),
        (1, SEXES, "Female"),
        (-1, EVENTS, "Unknown"),
        (None, SEXES, "Unknown"),
        (True, EVENTS, "Unknown"),
    ],
)
def test_enum_labels(value, options, label):
    assert enum(value, options)["label"] == label


def test_dates_are_aware_and_not_silently_swapped():
    with pytest.raises(ValueError):
        date_filters("2026-09-20", None)
    with pytest.raises(ValueError):
        date_filters(NOW.isoformat(), (NOW - timedelta(days=1)).isoformat())


def test_cursor_bound_to_scope_filter_and_clock():
    key = query_key(scope("11"), {"severity": "high"})
    cursor = encode_cursor(key, NOW, "12", NOW)
    assert decode_cursor(cursor, key, NOW)[1] == "12"
    for other_key, clock in [
        (query_key(scope("22"), {"severity": "high"}), NOW),
        (query_key(scope("11"), {}), NOW),
        (key, NOW - timedelta(seconds=1)),
    ]:
        with pytest.raises(ValueError):
            decode_cursor(cursor, other_key, clock)
    with pytest.raises(ValueError):
        decode_cursor("malformed", key, NOW)


def event(i):
    return dict(
        site_id=11,
        device_id=101,
        event_id=f"00000000-0000-4000-8000-{i:012d}",
        event=1,
        timestamp=NOW - timedelta(minutes=1),
        sex=0,
        age_bucket=i % 6,
    )


class BQ:
    def __init__(self, rows=None, duplicate=False):
        self.rows = rows if rows is not None else [event(i) for i in range(25, 0, -1)]
        self.calls = []
        self.duplicate = duplicate

    def portal_rows(self, sql, params, limit):
        self.calls.append((sql, dict(params), limit))
        if "COUNT(*)" in sql:
            return [
                dict(
                    total=len(self.rows),
                    unique_ids=len(self.rows) - int(self.duplicate),
                )
            ]
        rows = self.rows
        if "last_id" in params:
            rows = [
                r
                for r in rows
                if (r["timestamp"], r["event_id"])
                < (params["last_ts"], params["last_id"])
            ]
        return rows[:limit]


def test_event_paging_ties_and_count_once():
    bq = BQ()
    service = EventLogs(bq)
    first = service.search(scope("11"), {})
    second = service.search(scope("11"), {}, cursor=first["page"]["next_cursor"])
    assert first["total"] == 25 and len(first["items"]) == 20
    assert second["total"] is None and len(second["items"]) == 5
    assert second["page"]["next_cursor"] is None
    assert not {r["event_id"] for r in first["items"]} & {
        r["event_id"] for r in second["items"]
    }
    assert sum("COUNT(*)" in sql for sql, _, _ in bq.calls) == 1
    for sql, params, _ in bq.calls:
        assert "organisation_id = @org" in sql and params["org"] == 77
        assert "site_id = @site" in sql and params["site"] == 11
        assert "timestamp <= @cutoff" in sql
        assert "SELECT *" not in sql


def test_event_source_semantics_and_exact_id():
    service = EventLogs(BQ())
    clauses, params, *_ = service.specification(
        scope(None, ["device:101", "gateway:11"]),
        {"event_id": "uuid", "event": "exit", "sex": "female", "age": "5"},
    )
    sql = " AND ".join(clauses)
    assert "site_id = @site" not in sql
    assert "device_id IN UNNEST(@devices) OR site_id IN UNNEST(@gateways)" in sql
    assert params["devices"] == [101] and params["gateways"] == [11]
    assert params["event_id"] == "uuid" and "event_id = @event_id" in sql
    assert params["event"] == 0 and params["sex"] == 1 and params["age"] == 5
    assert "race" not in sql and "track" not in sql


@pytest.mark.parametrize("size", [0, 101, -1])
def test_event_page_bounds(size):
    with pytest.raises(ValueError):
        EventLogs(BQ()).search(scope(), {}, page_size=size)


def test_event_id_integrity_checked_before_keyset():
    with pytest.raises(InvalidEventData):
        EventLogs(BQ(duplicate=True)).search(scope(), {})


@pytest.mark.parametrize(
    "bucket,label", list(enumerate(["0–4", "5–13", "14–25", "26–45", "46–65", "66+"]))
)
def test_event_age_and_canonical_row(bucket, label):
    row = event(bucket)
    result = EventLogs.present(scope(), row)
    assert result["age"]["label"] == label
    assert result["source"]["label"] == "Front Door"
    assert "race" not in result and "track_id" not in result


def test_production_no_demo_cutoff():
    clauses, *_ = EventLogs(BQ()).specification(scope(cutoff=None), {})
    assert not any("cutoff" in clause for clause in clauses)


def test_export_scope_limit_and_formula_safety():
    bq = BQ([event(1)])
    selected = scope("11")
    selected.context["sources"][0]["label"] = "=HYPERLINK()"
    csv = "".join(EventLogs(bq).export(selected, {}))
    assert "'=HYPERLINK()" in csv and "Event ID" in csv
    assert "Race" not in csv and "Track" not in csv
    assert bq.calls[0][1]["site"] == 11
    with pytest.raises(ValueError, match="Narrow"):
        EventLogs(BQ()).export(scope(), {}, limit=10)


class Database:
    def __init__(self):
        self.calls = []
        self.rows = [
            (
                i,
                11 if i % 2 else 22,
                "Site",
                "connection_lost",
                "high",
                NOW - timedelta(minutes=1),
                NOW,
                101,
                "Front Door",
                None,
            )
            for i in range(25, 0, -1)
        ]

    @contextmanager
    def connection(self):
        yield self

    def cursor(self):
        return self

    def close(self):
        pass

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        self.sql, self.params = sql, params

    def fetchone(self):
        return (2, 25)

    def fetchall(self):
        if "IS NULL ORDER" in self.sql:
            return [(99, 11, "Site", "active", "high", NOW, None, None, None, 11)]
        rows = self.rows
        if "a.id < %s" in self.sql:
            rows = [r for r in rows if r[0] < self.params[-1]]
        return rows[:11]


def test_alarm_ten_then_ten_then_partial_and_true_counts():
    db = Database()
    service = AlarmLogs(db)
    one = service.search(scope(), {})
    two = service.search(scope(), {}, one["cleared"]["next_cursor"])
    three = service.search(scope(), {}, two["cleared"]["next_cursor"])
    assert one["counts"] == dict(active=2, cleared=25)
    assert [len(v["cleared"]["items"]) for v in (one, two, three)] == [10, 10, 5]
    assert three["cleared"]["has_more"] is False
    ids = [r["id"] for v in (one, two, three) for r in v["cleared"]["items"]]
    assert len(set(ids)) == 25
    assert one["active"]["items"][0]["status"] == "active"
    assert all(r["status"] == "cleared" for r in one["cleared"]["items"])
    assert "counts" not in two and "active" not in two
    for sql, params in db.calls:
        if "FROM public.alarms" in sql:
            assert "a.organisation_id = %s" in sql and params[0] == 77


def test_alarm_gateway_is_origin_not_site_aggregate():
    db = Database()
    result = AlarmLogs(db).search(scope("11", ["gateway:11"]), {"severity": "high"})
    for sql, params in db.calls:
        if "FROM public.alarms" in sql:
            assert "a.gateway_id = %s" in sql
            assert "private-gateway-uuid" in params
            assert "a.site_id = %s" in sql
    assert "private-gateway-uuid" not in str(result)
    assert result["active"]["items"][0]["source"]["label"] == "Gateway 11"


def client(fail=False):
    app = FastAPI()
    app.include_router(portal.router)
    app.state.portal_metadata = Metadata()
    app.state.portal_events = EventLogs(BQ([]))
    app.state.portal_alarms = AlarmLogs(Database())
    if fail:

        def broken(*args, **kwargs):
            raise RuntimeError("private_key sa.json SELECT secret")

        app.state.portal_events.search = broken
    return TestClient(app)


@pytest.mark.parametrize(
    "suffix",
    [
        "?organisation_id=88",
        "?race=0",
        "?track_id=x",
        "?site_id=99",
        "?site_id=11&source=device:202",
        "?cursor=bad",
        "?page_size=0",
        "?effective_now=2999-01-01T00:00:00Z",
    ],
)
def test_api_rejects_forged_scope_and_bad_filters(suffix):
    assert client().get("/api/demo/portal/events" + suffix).status_code in (404, 422)


def test_api_outage_is_not_empty_and_sanitized():
    assert client().get("/api/demo/portal/events").json()["total"] == 0
    response = client(True).get("/api/demo/portal/events")
    assert response.status_code == 503
    assert all(s not in response.text for s in ["private_key", "sa.json", "SELECT"])


def test_no_alarm_write_route():
    assert client().post("/api/demo/portal/alarms").status_code == 405


def test_metadata_bulk_projection_and_private_gateway_mapping():
    from backend.app.services.portal_context import PortalMetadata

    class DB(Database):
        def fetchall(self):
            if "public.devices" in self.sql:
                return [(9007199254740993, 11, "Front Door", NOW)]
            return [("private-uuid", 11)]

    db = DB()
    dashboard = SimpleNamespace(
        load_organisation_context=lambda org: {
            "organisation": {"id": str(org)},
            "sites": [{"id": "11"}],
        }
    )
    result, private = PortalMetadata(db, dashboard).load(PortalIdentity(77, NOW))
    assert len(db.calls) == 2
    assert private == {"gateway:11": "private-uuid"}
    assert "private-uuid" not in str(result)
    assert result["sources"][0]["ref"] == "device:9007199254740993"
    for sql, params in db.calls:
        assert "s.organisation_id = %s" in sql and params == (77,)
        assert all(
            secret not in sql
            for secret in ("rtsp_uri", "rtsp_password", "rtsp_username", "SELECT *")
        )


def test_bigquery_timeout_cancels_without_dataframe(monkeypatch):
    from backend.app.services.bigquery_client import BigQueryClient

    calls = {}

    class Job:
        def result(self, **kwargs):
            calls["result"] = kwargs
            raise TimeoutError()

        def cancel(self):
            calls["cancelled"] = True

    def query(sql, **kwargs):
        calls["query"] = kwargs
        return Job()

    reader = BigQueryClient()
    monkeypatch.setattr(reader, "_ensure_client", lambda: SimpleNamespace(query=query))
    with pytest.raises(TimeoutError):
        reader.portal_rows("SELECT @org", {"org": 77}, limit=21)
    assert calls["result"]["max_results"] == 21
    assert calls["result"]["timeout"] == 30 and calls["cancelled"]
    assert calls["query"]["job_config"].maximum_bytes_billed == 1000000000
    assert reader._credentials is None


def test_alarm_filter_change_invalidates_cursor():
    service = AlarmLogs(Database())
    cursor = service.search(scope("11"), {})["cleared"]["next_cursor"]
    with pytest.raises(ValueError):
        service.search(scope("22"), {}, cursor)
    with pytest.raises(ValueError):
        service.search(scope("11"), {"severity": "high"}, cursor)


def test_alarm_clock_is_eligibility_not_historical_status():
    db = Database()
    result = AlarmLogs(db).search(scope(), {})
    assert all(r["status"] == "cleared" for r in result["cleared"]["items"])
    for sql, params in db.calls:
        if "FROM public.alarms" in sql:
            assert "a.started_at <= %s" in sql and NOW in params
            assert "a.cleared_at <=" not in sql


def test_alarm_empty_and_failure_are_distinct():
    class Empty(Database):
        def fetchone(self):
            return (0, 0)

        def fetchall(self):
            return []

    assert AlarmLogs(Empty()).search(scope(), {})["counts"] == dict(active=0, cleared=0)
    app = FastAPI()
    app.include_router(portal.router)
    app.state.portal_metadata = Metadata()
    app.state.portal_alarms = SimpleNamespace(
        search=lambda *a: (_ for _ in ()).throw(RuntimeError("secret"))
    )
    response = TestClient(app).get("/api/demo/portal/alarms")
    assert response.status_code == 503 and "secret" not in response.text


@pytest.mark.parametrize(
    "site,source", [("1", "site-a"), ("2", "site-b"), (None, "all")]
)
def test_reports_real_sqlite_adapter_scope_and_cutoff(
    tmp_path, monkeypatch, site, source
):
    import sqlite3
    import json
    from backend.app.services import local_data

    path = tmp_path / "snapshot.db"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE snapshots (ts TEXT NOT NULL, payload TEXT NOT NULL)")
        db.execute(
            "INSERT INTO snapshots VALUES (?, ?)",
            ("2026-09-20 12:00:00 UTC", json.dumps([[7] * 96])),
        )
        db.execute(
            "INSERT INTO snapshots VALUES (?, ?)",
            ("2099-01-01 00:00:00 UTC", json.dumps([[99] * 96])),
        )
    used = []
    monkeypatch.setattr(
        local_data, "snapshot_db_for_site", lambda value: used.append(value) or path
    )
    monkeypatch.setattr(portal, "demo_identity", lambda: PortalIdentity(1, NOW))

    class ReportMetadata(Metadata):
        def load(self, identity):
            context, gateways = super().load(identity)
            context["sites"] = [{"id": "1"}, {"id": "2"}, {"id": "3"}]
            return context, gateways

    app = FastAPI()
    app.include_router(portal.router)
    app.state.portal_metadata = ReportMetadata()
    api = TestClient(app)
    response = api.get(
        "/api/demo/portal/reports/snapshot", params={"site_id": site} if site else {}
    )
    assert response.status_code == 200 and response.json()["scope"] == {
        "organisation_id": "1",
        "site_id": site,
    }
    assert (
        response.json()["payload"][0][0] == 7 and response.json()["fallback"] is False
    )
    assert used == [source]
    missing = api.get("/api/demo/portal/reports/snapshot?site_id=3")
    assert missing.status_code == 404 and "Reports unavailable" in missing.text


def test_retires_legacy_event_endpoint_without_fallback():
    from backend.app.api.analytics import router

    app = FastAPI()
    app.include_router(router)
    assert TestClient(app).get("/api/search-events").status_code == 410
