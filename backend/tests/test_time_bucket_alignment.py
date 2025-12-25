import pytest

import re

from backend.app.analytics.compiler import CompilerContext, SpecCompiler
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec


def _compile_live_flow(bucket: str) -> str:
    spec = get_dashboard_spec("dashboard.live_flow")
    spec["timeWindow"]["bucket"] = bucket
    spec["dimensions"][0]["bucket"] = bucket
    spec["timeWindow"]["from"] = "2024-01-01T00:00:00Z"
    spec["timeWindow"]["to"] = "2024-01-01T02:00:00Z"
    compiler = SpecCompiler()
    compiled = compiler.compile(spec, CompilerContext(table_name="project.dataset.table"))
    return compiled.sql


@pytest.mark.parametrize("bucket,seconds", [("5_MIN", 300), ("15_MIN", 900), ("30_MIN", 1800)])
def test_minute_buckets_align_without_invalid_trunc(bucket: str, seconds: int):
    sql = _compile_live_flow(bucket)
    assert "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), MINUTE" not in sql
    pattern = rf"DIV\(UNIX_SECONDS\((?:GREATEST\(TIMESTAMP\(@start_ts\)[^)]*|TIMESTAMP\(@start_ts\))"
    assert re.search(pattern, sql)
    assert any(
        interval in sql
        for interval in (
            "INTERVAL 5 MINUTE",
            "INTERVAL 15 MINUTE",
            "INTERVAL 30 MINUTE",
        )
    )


def test_six_hour_bucket_uses_epoch_alignment():
    spec = get_dashboard_spec("dashboard.live_flow")
    spec["timeWindow"]["bucket"] = "6_HOUR"
    spec["dimensions"][0]["bucket"] = "6_HOUR"
    spec["timeWindow"]["from"] = "2024-01-01T00:00:00Z"
    spec["timeWindow"]["to"] = "2024-01-31T00:00:00Z"
    compiler = SpecCompiler()
    compiled = compiler.compile(spec, CompilerContext(table_name="project.dataset.table"))
    sql = compiled.sql
    assert "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), HOUR)" not in sql
    pattern = r"DIV\(UNIX_SECONDS\((?:GREATEST\(TIMESTAMP\(@start_ts\)[^)]*|TIMESTAMP\(@start_ts\))"
    assert re.search(pattern, sql)
    assert "INTERVAL 6 HOUR" in sql
