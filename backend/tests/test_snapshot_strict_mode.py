import pytest

from backend.app.snapshots import SnapshotLookupError, fetch_latest_snapshot


def test_fetch_latest_snapshot_can_disable_fixture_fallback(monkeypatch):
    monkeypatch.delenv("BQ_PROJECT", raising=False)
    monkeypatch.delenv("BQ_DATASET", raising=False)

    with pytest.raises(SnapshotLookupError, match="fallback fixture is disabled"):
        fetch_latest_snapshot("client1", allow_fallback=False)
