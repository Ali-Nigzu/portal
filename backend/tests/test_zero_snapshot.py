"""Dashboard readers fall back on absent/unusable data; Reports remain strict."""

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone

import pytest

from backend.app.services.organisation_dashboard import EntityNotFound, InvalidSnapshot, OrganisationDashboard
from backend.app.services.portal_context import PortalIdentity, PortalScope
from backend.app.services.portal_reports import InvalidReportSnapshot, PortalReports, ReportSnapshotNotFound
from backend.app.services.zero_snapshot import build_zero_snapshot, build_zero_scope_snapshot

NOW = datetime(2026, 1, 2, 10, 30, tzinfo=timezone.utc)
OID = 900000000000000101


def scope(site=None, count=2):
    sites = [dict(id=str(42 + i), organisation_id=str(OID), name=f"Site {i + 1}")
             for i in range(count)]
    context = dict(
        organisation=dict(id=str(OID), name="Real organisation"), sites=sites,
        sources=[dict(ref="device:900000000000000201", kind="device", site_id="42", label="Real camera"),
                 dict(ref="gateway:42", kind="gateway", site_id="42", label="Gateway 42"),
                 dict(ref="device:900000000000000202", kind="device", site_id="43", label="Other camera")],
        clock=dict(effective_now=NOW.isoformat()),
    )
    return PortalScope(PortalIdentity(OID), context, {}, site, [])


class Database:
    def __init__(self, row=None, error=None):
        self.row, self.error, self.queries = row, error, []

    @contextmanager
    def connection(self):
        if self.error:
            raise self.error
        yield self

    def cursor(self):
        return self

    def execute(self, sql, params):
        assert sql.startswith("SELECT ")
        assert not any(word in sql.upper() for word in ("INSERT ", "UPDATE ", "DELETE "))
        assert "ORDER BY" not in sql and "LIMIT" not in sql
        assert ".ts" not in sql.split("WHERE", 1)[1]
        self.queries.append((sql, params))

    def fetchone(self):
        return self.row

    def close(self):
        pass


def read_dashboard(database, selected):
    reader = OrganisationDashboard(database)
    if selected.site_id is None:
        return reader.load_organisation_snapshot(OID, zero_scope=selected)
    return reader.load_site_snapshot(OID, int(selected.site_id), zero_scope=selected)


@pytest.mark.parametrize("site,count", [(None, 0), (None, 1), (None, 3), ("42", 1), ("43", 3)])
def test_missing_readers_return_same_complete_zero_model(site, count):
    selected = scope(site, count)
    before = deepcopy(selected.context)
    expected = build_zero_scope_snapshot(selected)
    dashboard_db, reports_db = Database(), Database()
    assert read_dashboard(dashboard_db, selected) == expected
    result = PortalReports(reports_db).read_snapshot(selected, allow_empty=True)
    assert result == {"scope": selected.dto, "snapshot": expected}
    assert set(expected) == {"scope", "entity_id", "entity_name", "ts", "payload"}
    assert expected["entity_id"] == (site or str(OID))
    assert expected["entity_name"] == (f"Site {int(site) - 41}" if site else "Real organisation")
    assert expected["ts"] == NOW.isoformat()
    assert selected.context == before
    assert len(dashboard_db.queries) == len(reports_db.queries) == 1
    p = expected["payload"]
    for key in ("entrances_96", "exits_96", "footfall_96", "dwell_time_96"):
        assert p[key] == [0] * 96
    assert p["occupancy_96"] == [[0, 0, 0]] * 96
    assert p["capacity"] == [[0, 0]] * 96
    assert p["traffic_split_96"] == [[0] * len(p["traffic_devices"])] * 96
    for period, length in dict(today=24, yesterday=24, week=7, month=4, quarter=12, year=12, all_time=1).items():
        assert p[period] == dict(entrances=[0] * length, exits=[0] * length,
                                 occupancy=[[0, 0, 0]] * length, age_pct=[0] * 6, sex_pct=[0] * 2)
    if site == "42":
        assert p["traffic_devices"] == [dict(device_id="900000000000000201", name="Real camera")]
    elif site is None:
        assert p["traffic_devices"] == [dict(site_id=s["id"], name=s["name"]) for s in selected.context["sites"]]


@pytest.mark.parametrize("site", [None, "42"])
@pytest.mark.parametrize("populated", [False, True])
def test_existing_snapshots_are_preserved_even_with_fallback_enabled(site, populated):
    selected = scope(site)
    stored = build_zero_scope_snapshot(selected)
    if populated:
        stored["payload"]["today"]["entrances"][0] = 17
    earlier = NOW.replace(year=2025)
    row = (int(stored["entity_id"]), "Stored relational name", earlier, stored["payload"])
    expected = dict(stored, entity_name=row[1], ts=earlier.isoformat())
    assert read_dashboard(Database(row), selected) == expected
    assert PortalReports(Database(row)).read_snapshot(selected, allow_empty=True)["snapshot"] == expected


@pytest.mark.parametrize("bad", [(42, "Site", NOW, []), (42, "Site", datetime(2026, 1, 2), {}), (42, "Site", None, {})])
def test_invalid_dashboard_rows_use_zero_but_reports_remain_strict(bad):
    selected = scope("42")
    assert read_dashboard(Database(bad), selected) == build_zero_scope_snapshot(selected)
    with pytest.raises(InvalidReportSnapshot):
        PortalReports(Database(bad)).read_snapshot(scope("42"), allow_empty=True)


def test_storage_failure_and_demo_absence_are_not_normalized():
    for read in (lambda db: read_dashboard(db, scope()),
                 lambda db: PortalReports(db).read_snapshot(scope(), allow_empty=True)):
        with pytest.raises(RuntimeError, match="storage failed"):
            read(Database(error=RuntimeError("storage failed")))
    with pytest.raises(ReportSnapshotNotFound):
        PortalReports(Database()).read_snapshot(scope())
    with pytest.raises(EntityNotFound):
        OrganisationDashboard(Database()).load_site_snapshot(OID, 42)


@pytest.mark.parametrize("site,foreign", [("999", False), ("42", True)])
def test_unknown_or_foreign_site_never_gets_zero_model(site, foreign):
    selected = scope(site)
    if foreign:
        selected.context["sites"][0]["organisation_id"] = "123"
    with pytest.raises(EntityNotFound):
        build_zero_scope_snapshot(selected)


def test_factory_rejects_naive_time_and_does_not_share_mutable_buckets():
    with pytest.raises(ValueError, match="timezone aware"):
        build_zero_snapshot("site", 42, "Site", datetime(2026, 1, 2))
    first = build_zero_scope_snapshot(scope())
    first["payload"]["capacity"][0][0] = 17
    first["payload"]["traffic_split_96"][0][0] = 17
    assert first["payload"]["capacity"][1] == [0, 0]
    assert first["payload"]["traffic_split_96"][1] == [0, 0]
    assert build_zero_scope_snapshot(scope())["payload"]["capacity"][0] == [0, 0]


@pytest.mark.parametrize("site", [None, "42"])
@pytest.mark.parametrize("mutation", [
    lambda p: p.clear(),
    lambda p: p.update(test=1) or p.pop("capacity"),
    lambda p: p.update(capacity=[[0]] * 96),
    lambda p: p.update(occupancy_96=[[0, 0]] * 96),
    lambda p: p.update(entrances_96=[True] * 96),
    lambda p: p.update(traffic_split_96=[[]] * 96),
    lambda p: p["today"].update(age_pct=[0]),
    lambda p: p["year"].update(occupancy=[[3, 4, 2]]),
    lambda p: p["all_time"].update(sex_pct=[10, 10]),
])
def test_unusable_dashboard_payload_falls_back_without_writing(site, mutation):
    selected = scope(site)
    payload = build_zero_scope_snapshot(selected)["payload"]
    mutation(payload)
    stored = (int(site or OID), "Stored", NOW, payload)
    before = deepcopy(stored)
    db = Database(stored)
    assert read_dashboard(db, selected) == build_zero_scope_snapshot(selected)
    assert db.row == before
    assert len(db.queries) == 1


@pytest.mark.parametrize("site", [None, "42"])
def test_usable_persisted_payload_preserves_existing_ranges_and_all_time(site):
    selected = scope(site)
    payload = build_zero_scope_snapshot(selected)["payload"]
    payload["capacity"][95] = [125, 150]
    payload["all_time"]["entrances"] = [0, 1, 2]
    payload["all_time"]["exits"] = [0, 1, 2]
    payload["all_time"]["occupancy"] = [[0, 0, 0], [1, 0, 2], [2, 1, 3]]
    payload["additional_admin_data"] = {"kept": True}
    stored = (int(site or OID), "Stored", NOW.replace(year=2025), payload)
    result = read_dashboard(Database(stored), selected)
    assert result["payload"] == payload
    assert result["ts"] == stored[2].isoformat()
