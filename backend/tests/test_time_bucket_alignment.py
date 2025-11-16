import pytest

from backend.app.analytics.compiler import CompilerContext, SpecCompiler
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec


def _compile_live_flow(bucket: str) -> str:
    spec = get_dashboard_spec("dashboard.live_flow")
    spec["timeWindow"]["bucket"] = bucket
    spec["dimensions"][0]["bucket"] = bucket
    compiler = SpecCompiler()
    compiled = compiler.compile(spec, CompilerContext(table_name="project.dataset.table"))
    return compiled.sql


@pytest.mark.parametrize("bucket,seconds", [("5_MIN", 300), ("15_MIN", 900), ("30_MIN", 1800)])
def test_minute_buckets_align_without_invalid_trunc(bucket: str, seconds: int):
    sql = _compile_live_flow(bucket)
    assert "TIMESTAMP_TRUNC(TIMESTAMP(@start_ts), MINUTE" not in sql
    expected = f"TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(TIMESTAMP(@start_ts)), {seconds}) * {seconds})"
    assert expected in sql
