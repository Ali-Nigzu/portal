from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.app.services.portal_reports import (
    InvalidReportSnapshot,
    PortalReports,
    ReportSnapshotNotFound,
)

NOW = datetime(2026, 9, 25, 18, 45, tzinfo=timezone.utc)


class Database:
    def __init__(self, row):
        self.row, self.queries, self.closed = row, [], 0

    @contextmanager
    def connection(self):
        yield self

    def cursor(self):
        return self

    def execute(self, sql, params):
        assert sql.startswith("SELECT ") and not any(
            word in sql.upper() for word in ("UPDATE ", "INSERT ", "DELETE ")
        )
        self.queries.append((sql, params))

    def fetchone(self):
        return self.row

    def close(self):
        self.closed += 1


def scope(site=None, cutoff=NOW):
    return SimpleNamespace(
        identity=SimpleNamespace(organisation_id=27, cutoff=cutoff),
        site_id=site,
        dto={"organisation_id": "27", "site_id": site},
    )


def row(entity=27, name="Customer", ts=NOW, payload=None):
    return (entity, name, ts, {"today": {}} if payload is None else payload)


def test_organisation_snapshot_reads_canonical_current_row_without_cutoff():
    db = Database(row())
    result = PortalReports(db).read_snapshot(scope(cutoff=None))
    sql, params = db.queries[0]
    assert "public.organisation_snapshots" in sql
    assert "os.ts" not in sql.split("WHERE", 1)[1]
    assert "ORDER BY" not in sql and "LIMIT" not in sql and params == (27,)
    assert result["scope"] == {"organisation_id": "27", "site_id": None}
    assert (
        result["snapshot"]["scope"] == "organisation"
        and result["snapshot"]["entity_name"] == "Customer"
    )
    assert db.closed == 1


def test_site_snapshot_reads_current_row_and_enforces_organisation():
    db = Database(row(42, "Owned site"))
    result = PortalReports(db).read_snapshot(scope("42", cutoff=None))
    sql, params = db.queries[0]
    assert (
        "public.site_snapshots" in sql and "s.id = %s AND s.organisation_id = %s" in sql
    )
    assert "ss.ts" not in sql.split("WHERE", 1)[1] and "ORDER BY" not in sql
    assert params == (42, 27) and result["snapshot"]["entity_id"] == "42"


def test_demo_clock_and_live_auth_return_the_same_canonical_snapshot():
    stored = row(42, "Owned site", ts=NOW, payload={"today": {"visitors": 7}})
    live = PortalReports(Database(stored)).read_snapshot(scope("42", cutoff=None))
    demo = PortalReports(Database(stored)).read_snapshot(scope("42", cutoff=NOW))
    assert live["snapshot"] == demo["snapshot"] == {
        "scope": "site",
        "entity_id": "42",
        "entity_name": "Owned site",
        "ts": NOW.isoformat(),
        "payload": {"today": {"visitors": 7}},
    }


@pytest.mark.parametrize(
    "bad",
    [
        None,
        (1, "Bad", "naive", {}),
        (1, "Bad", datetime(2026, 1, 1), {}),
        (1, "Bad", NOW, []),
        (0, "Bad", NOW, {}),
        (1, "", NOW, {}),
    ],
)
def test_missing_and_invalid_snapshots_fail_explicitly(bad):
    if bad is None:
        with pytest.raises(ReportSnapshotNotFound):
            PortalReports(Database(bad)).read_snapshot(scope())
    else:
        with pytest.raises(InvalidReportSnapshot):
            PortalReports(Database(bad)).read_snapshot(scope())
