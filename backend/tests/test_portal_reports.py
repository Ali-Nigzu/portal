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


def scope(site=None):
    return SimpleNamespace(
        identity=SimpleNamespace(organisation_id=27, cutoff=NOW),
        site_id=site,
        dto={"organisation_id": "27", "site_id": site},
    )


def row(entity=27, name="Customer", ts=NOW, payload=None):
    return (entity, name, ts, {"today": {}} if payload is None else payload)


def test_organisation_snapshot_is_latest_eligible_and_read_only():
    db = Database(row())
    result = PortalReports(db).read_snapshot(scope())
    sql, params = db.queries[0]
    assert "public.organisation_snapshots" in sql and "os.ts <= %s" in sql
    assert "ORDER BY os.ts DESC LIMIT 1" in sql and params == (27, NOW)
    assert result["scope"] == {"organisation_id": "27", "site_id": None}
    assert (
        result["snapshot"]["scope"] == "organisation"
        and result["snapshot"]["entity_name"] == "Customer"
    )
    assert db.closed == 1


def test_site_snapshot_enforces_organisation_and_cutoff():
    db = Database(row(42, "Owned site"))
    result = PortalReports(db).read_snapshot(scope("42"))
    sql, params = db.queries[0]
    assert (
        "public.site_snapshots" in sql and "s.id = %s AND s.organisation_id = %s" in sql
    )
    assert "ss.ts <= %s" in sql and "ORDER BY ss.ts DESC LIMIT 1" in sql
    assert params == (42, 27, NOW) and result["snapshot"]["entity_id"] == "42"


def test_latest_at_or_before_cutoff_excludes_future_and_includes_exact_cutoff():
    class HistoricalDatabase(Database):
        def __init__(self, rows):
            super().__init__(None)
            self.rows = rows

        def fetchone(self):
            cutoff = self.queries[-1][1][-1]
            eligible = [candidate for candidate in self.rows if candidate[2] <= cutoff]
            return (
                max(eligible, key=lambda candidate: candidate[2]) if eligible else None
            )

    older = datetime(2026, 9, 25, 17, 0, tzinfo=timezone.utc)
    future = datetime(2026, 9, 25, 19, 0, tzinfo=timezone.utc)
    db = HistoricalDatabase(
        [row(ts=older), row(name="Exact cutoff", ts=NOW), row(name="Future", ts=future)]
    )
    result = PortalReports(db).read_snapshot(scope())
    assert result["snapshot"]["entity_name"] == "Exact cutoff"
    assert result["snapshot"]["ts"] == NOW.isoformat()


@pytest.mark.parametrize(
    "bad",
    [
        None,
        (1, "Bad", "naive", {}),
        (1, "Bad", datetime(2026, 1, 1), {}),
        (1, "Bad", NOW, []),
    ],
)
def test_missing_and_invalid_snapshots_fail_explicitly(bad):
    if bad is None:
        with pytest.raises(ReportSnapshotNotFound):
            PortalReports(Database(bad)).read_snapshot(scope())
    else:
        with pytest.raises(InvalidReportSnapshot):
            PortalReports(Database(bad)).read_snapshot(scope())
