"""Regression tests guarding canonical event and track identifiers in SQL compilation."""

from __future__ import annotations

import re
from datetime import datetime, timezone

import pytest

from backend.app.analytics.compiler import CompilerContext, SpecCompiler
from backend.app.analytics.dashboard_catalogue import DASHBOARD_SPEC_CATALOGUE
from backend.app.analytics.data_contract import (
    Dimension,
    Metric,
    QueryContext,
    compile_contract_query,
)

UTC = timezone.utc


def _extract_ctes(sql: str) -> dict[str, str]:
    pattern = re.compile(r"(\w+)\s+AS\s+\(")
    ctes: dict[str, str] = {}
    for match in pattern.finditer(sql):
        name = match.group(1)
        start = match.end()
        depth = 1
        idx = start
        while idx < len(sql) and depth:
            char = sql[idx]
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            idx += 1
        body = sql[start : idx - 1]
        ctes[name] = body
    return ctes


def _assert_canonical_event_scope(sql: str) -> None:
    ctes = _extract_ctes(sql)
    assert "scoped" in ctes, "scoped CTE missing from compiled SQL"
    scoped_body = ctes["scoped"]
    assert " index" in scoped_body or "index," in scoped_body, "scoped CTE must project index"
    assert " event " in scoped_body or "event," in scoped_body, "scoped CTE must project event"
    assert "track_id" in scoped_body, "scoped CTE must project track_id"
    assert re.search(r"\bevent_index\b", sql) is None
    assert re.search(r"\bevent_type\b", sql) is None
    assert re.search(r"\btrack_no\b", sql) is None

    for name, body in ctes.items():
        if name == "scoped":
            continue
        if "event " not in body and "event=" not in body and "event," not in body:
            continue
        assert (
            "FROM scoped" in body
            or "JOIN scoped" in body
            or "scoped." in body
        ), f"{name} references event without scoped context"


def _context(bucket: str) -> QueryContext:
    return QueryContext(
        org_id="client0",
        table_name="project.dataset.client0",
        start=datetime(2024, 1, 1, tzinfo=UTC),
        end=datetime(2024, 1, 2, tzinfo=UTC),
        bucket=bucket,
    )


def test_dashboard_live_flow_preserves_canonical_event_scope() -> None:
    spec = DASHBOARD_SPEC_CATALOGUE["dashboard.live_flow"]
    compiler = SpecCompiler()
    compiled = compiler.compile(spec, CompilerContext(table_name="project.dataset.client0"))
    _assert_canonical_event_scope(compiled.sql)


@pytest.mark.parametrize(
    "metric",
    [Metric.OCCUPANCY, Metric.ENTRANCES, Metric.EXITS],
)
def test_contract_activity_metrics_reference_event_from_scoped(metric: Metric) -> None:
    ctx = _context(bucket="HOUR")
    plan = compile_contract_query(metric, [Dimension.TIME], ctx)
    _assert_canonical_event_scope(plan.sql)


def test_dwell_pipeline_keeps_event_in_scope() -> None:
    ctx = _context(bucket="HOUR")
    plan = compile_contract_query(Metric.AVG_DWELL, [Dimension.TIME], ctx)
    _assert_canonical_event_scope(plan.sql)


def test_retention_pipeline_keeps_event_in_scope() -> None:
    ctx = _context(bucket="WEEK")
    plan = compile_contract_query(
        Metric.RETENTION_RATE,
        [Dimension.TIME, Dimension.RETENTION_LAG],
        ctx,
    )
    _assert_canonical_event_scope(plan.sql)


def test_calendar_uses_timestamp_bounds() -> None:
    ctx = _context(bucket="HOUR")
    plan = compile_contract_query(Metric.ACTIVITY, [Dimension.TIME], ctx)
    assert "GENERATE_TIMESTAMP_ARRAY" in plan.sql
    assert "TIMESTAMP(@start_ts)" in plan.sql
    assert "TIMESTAMP(@end_ts)" in plan.sql
    assert re.search(r"GENERATE_TIMESTAMP_ARRAY\([^,]+,\s*'[^']+'", plan.sql) is None
