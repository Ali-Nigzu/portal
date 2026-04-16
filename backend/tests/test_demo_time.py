from datetime import datetime

from backend.app.services.demo_time import (
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
    start, end = resolve_demo_bounds("2026-04-16", None)
    assert start == datetime(2026, 4, 16, 0, 0, 0)
    assert end == datetime(2100, 1, 1, 0, 0, 0)
