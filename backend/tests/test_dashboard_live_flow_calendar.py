import copy
from datetime import datetime, timezone

from backend.app.analytics.compiler import (
    _BUCKET_SECONDS,
    _MAX_CALENDAR_BUCKETS,
    _bucket_rank,
    CompilerContext,
    SpecCompiler,
)
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec


def _compile(spec: dict) -> tuple[str, str, SpecCompiler]:
    compiler = SpecCompiler()
    context = CompilerContext(table_name="project.dataset.table")
    compiled = compiler.compile(spec, context)
    return compiled.bucket, compiled.sql, compiler


def test_live_flow_all_time_coarsens_bucket() -> None:
    spec = copy.deepcopy(get_dashboard_spec("dashboard.live_flow"))
    spec["timeWindow"] = {
        "from": "1970-01-01T00:00:00Z",
        "to": "2024-01-01T00:00:00Z",
        "bucket": "5_MIN",
        "timezone": "UTC",
    }
    spec["dimensions"][0]["bucket"] = "5_MIN"

    bucket, sql, _ = _compile(spec)
    span_seconds = (
        datetime.fromisoformat("2024-01-01T00:00:00+00:00")
        - datetime.fromisoformat("1970-01-01T00:00:00+00:00")
    ).total_seconds()
    interval_seconds = _BUCKET_SECONDS.get(bucket)
    if interval_seconds:
        assert span_seconds / interval_seconds <= _MAX_CALENDAR_BUCKETS
    assert _bucket_rank(bucket) >= _bucket_rank("HOUR")
    assert "INTERVAL 5 MINUTE" not in sql


def test_live_flow_recent_window_keeps_granularity() -> None:
    spec = copy.deepcopy(get_dashboard_spec("dashboard.live_flow"))
    spec["timeWindow"] = {
        "from": "2024-01-01T00:00:00Z",
        "to": "2024-01-01T01:00:00Z",
        "bucket": "5_MIN",
        "timezone": "UTC",
    }
    spec["dimensions"][0]["bucket"] = "5_MIN"

    bucket, sql, _ = _compile(spec)
    assert bucket == "5_MIN"
    assert "INTERVAL 5 MINUTE" in sql
