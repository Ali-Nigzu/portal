from datetime import datetime, timedelta, timezone

from backend.app.data_processor import _resolve_time_bounds


UTC = timezone.utc


def test_resolve_time_bounds_clamps_future_end_date() -> None:
    before = datetime.now(tz=UTC)
    future_date = (before + timedelta(days=2)).date().isoformat()
    bounds = _resolve_time_bounds({"start_date": None, "end_date": future_date})
    after = datetime.now(tz=UTC)
    assert bounds["end_ts"] <= after
    assert bounds["end_ts"] >= before


def test_resolve_time_bounds_defaults_end_to_now() -> None:
    before = datetime.now(tz=UTC)
    bounds = _resolve_time_bounds({"start_date": None, "end_date": None})
    after = datetime.now(tz=UTC)
    assert bounds["end_ts"] <= after
    assert bounds["end_ts"] >= before
