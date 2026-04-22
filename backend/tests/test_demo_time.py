from datetime import datetime

from backend.app.services.demo_time import (
    demo_now,
    format_demo_timestamp,
    parse_demo_timestamp,
    resolve_demo_bounds,
)


def test_parse_demo_timestamp_preserves_clock_from_utc_suffix():
    parsed = parse_demo_timestamp("2026-04-16 13:00:00 UTC")
    assert parsed == datetime(2026, 4, 16, 13, 0, 0)


def test_format_demo_timestamp_stable_sql_shape():
    value = datetime(2026, 4, 16, 0, 5, 7)
    assert format_demo_timestamp(value) == "2026-04-16 00:05:07"


def test_resolve_demo_bounds_defaults_to_future_end():
    now = datetime(2026, 4, 16, 19, 56, 0)
    start, end = resolve_demo_bounds("2026-04-16", None, now=now)
    assert start == datetime(2026, 4, 16, 0, 0, 0)
    assert end == now


def test_resolve_demo_bounds_caps_future_end_date_to_now():
    now = datetime(2026, 4, 16, 19, 56, 0)
    start, end = resolve_demo_bounds("2026-04-16", "2026-04-16", now=now)
    assert start == datetime(2026, 4, 16, 0, 0, 0)
    assert end == now


def test_demo_now_uses_configured_timezone(monkeypatch):
    monkeypatch.setenv("DEMO_NOW_TIMEZONE", "UTC")
    utc_now = demo_now()
    monkeypatch.setenv("DEMO_NOW_TIMEZONE", "Europe/London")
    london_now = demo_now()
    # During BST this should differ by one hour; during GMT they can be equal.
    delta_seconds = int((london_now - utc_now).total_seconds())
    assert delta_seconds in {0, 3600, -3600}
