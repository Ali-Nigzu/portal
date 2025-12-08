from datetime import datetime, timedelta, timezone

from backend.app.analytics.time_windows import DEFAULT_ANALYTICS_LOOKBACK_DAYS, ensure_time_window


def test_ensure_time_window_adds_default_when_missing():
    anchor = datetime(2024, 2, 1, 12, 0, tzinfo=timezone.utc)
    spec = {"id": "spec"}

    ensured = ensure_time_window(spec, now=anchor)

    assert ensured["timeWindow"]["to"] == anchor.isoformat()
    expected_from = anchor - timedelta(days=DEFAULT_ANALYTICS_LOOKBACK_DAYS)
    assert ensured["timeWindow"]["from"] == expected_from.isoformat()
    assert ensured["timeWindow"]["timezone"] == "UTC"


def test_ensure_time_window_preserves_existing_window_and_fills_timezone():
    anchor = datetime(2024, 2, 1, 12, 0, tzinfo=timezone.utc)
    spec = {"id": "spec", "timeWindow": {"from": "a", "to": "b"}}

    ensured = ensure_time_window(spec, now=anchor, default_timezone="America/New_York")

    assert ensured["timeWindow"]["from"] == "a"
    assert ensured["timeWindow"]["to"] == "b"
    assert ensured["timeWindow"]["timezone"] == "America/New_York"
