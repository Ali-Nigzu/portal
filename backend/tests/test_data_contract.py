import re
from datetime import datetime, timedelta, timezone

import pytest

from backend.app.analytics.data_contract import (
    Dimension,
    Metric,
    QueryContext,
    TimeRangeKey,
    UnsupportedMetricDimensionCombination,
    compile_contract_query,
)


UTC = timezone.utc


def _context(**overrides) -> QueryContext:
    base = {
        "org_id": "client0",
        "table_name": "project.dataset.events",
        "start": datetime(2024, 1, 1, tzinfo=UTC),
        "end": datetime(2024, 1, 2, tzinfo=UTC),
    }
    base.update(overrides)
    return QueryContext(**base)


def test_time_range_resolution_sets_bounds() -> None:
    ctx = QueryContext(org_id="client0", table_name="project.dataset.events", time_range=TimeRangeKey.LAST_24_HOURS)
    assert ctx.start is not None
    assert ctx.end is not None
    assert ctx.bucket == "HOUR"
    assert ctx.end - ctx.start == timedelta(hours=24)


def test_time_range_week_window() -> None:
    ctx = QueryContext(org_id="client0", table_name="project.dataset.events", time_range=TimeRangeKey.LAST_7_DAYS)
    assert ctx.bucket == "DAY"
    assert ctx.end - ctx.start == timedelta(days=7)


def test_time_range_month_window() -> None:
    ctx = QueryContext(org_id="client0", table_name="project.dataset.events", time_range=TimeRangeKey.LAST_30_DAYS)
    assert ctx.bucket == "DAY"
    assert ctx.end - ctx.start == timedelta(days=30)


def test_compile_activity_query_with_filters() -> None:
    ctx = _context(
        site_ids=["SITE_01"],
        camera_ids=["CAM_A"],
        sexes=["Unknown"],
        age_buckets=["26-45"],
        bucket="HOUR",
    )
    plan = compile_contract_query(Metric.ACTIVITY, [Dimension.TIME], ctx)
    assert "COUNT(" in plan.sql
    assert "site_id IN UNNEST(@site_id_0)" in plan.sql
    assert "cam_id IN UNNEST(@cam_id_0)" in plan.sql
    assert "COALESCE(sex, 'Unknown') IN UNNEST(@sex_0)" in plan.sql
    assert "COALESCE(age_bucket, 'Unknown') IN UNNEST(@age_bucket_0)" in plan.sql
    assert plan.params["sex_0"] == ["Unknown"]
    assert plan.params["age_bucket_0"] == ["26-45"]
    assert plan.params["start_ts"] == ctx.start.isoformat()
    assert plan.params["end_ts"] == ctx.end.isoformat()


def test_retention_requires_specific_dimensions() -> None:
    ctx = _context(bucket="WEEK")
    with pytest.raises(UnsupportedMetricDimensionCombination):
        compile_contract_query(Metric.RETENTION_RATE, [Dimension.TIME], ctx)


def test_event_summary_query_shape() -> None:
    ctx = _context()
    plan = compile_contract_query(Metric.EVENT_SUMMARY, [], ctx)
    assert "COUNTIF(event_type = 1)" in plan.sql
    assert "COUNTIF(event_type = 0)" in plan.sql
    assert plan.params["start_ts"] == ctx.start
    assert plan.params["end_ts"] == ctx.end


def test_raw_events_limit_parameter() -> None:
    ctx = _context()
    plan = compile_contract_query(Metric.RAW_EVENTS, [], ctx)
    assert "LIMIT @limit" in plan.sql
    assert plan.params["limit"] == 10000


def test_raw_events_offset_override() -> None:
    ctx = _context(limit=25, offset=50)
    plan = compile_contract_query(Metric.RAW_EVENTS, [], ctx)
    assert "LIMIT @limit OFFSET @offset" in plan.sql
    assert plan.params["limit"] == 25
    assert plan.params["offset"] == 50


def _scoped_projection(sql: str) -> str:
    match = re.search(r"scoped AS \(\s*SELECT\s+(.*?)\s+FROM", sql, re.S)
    assert match is not None, "scoped CTE not found"
    return " ".join(match.group(1).split())


def test_scoped_cte_projects_canonical_columns() -> None:
    ctx = _context(bucket="HOUR")
    plan = compile_contract_query(Metric.OCCUPANCY, [Dimension.TIME], ctx)
    projection = _scoped_projection(plan.sql)
    expected = (
        "timestamp, event_type, IFNULL(index, 0) AS event_index, site_id, cam_id, "
        "track_no, COALESCE(sex, 'Unknown') AS sex, COALESCE(age_bucket, 'Unknown') AS age_bucket"
    )
    assert projection == " ".join(expected.split())


def test_metric_queries_use_timestamp_bounds() -> None:
    ctx = _context(bucket="HOUR")
    plan = compile_contract_query(Metric.ENTRANCES, [Dimension.TIME], ctx)
    assert "timestamp BETWEEN @start_ts AND @end_ts" in plan.sql


def test_event_summary_filters_apply_coalesce() -> None:
    ctx = _context(sexes=["Unknown"], age_buckets=["14-25"])
    plan = compile_contract_query(Metric.EVENT_SUMMARY, [], ctx)
    assert "COALESCE(sex, 'Unknown') IN UNNEST(@sex_filters)" in plan.sql
    assert "COALESCE(age_bucket, 'Unknown') IN UNNEST(@age_filters)" in plan.sql
    assert plan.params["sex_filters"] == ["Unknown"]
    assert plan.params["age_filters"] == ["14-25"]


def test_raw_events_selects_coalesced_demographics() -> None:
    ctx = _context()
    plan = compile_contract_query(Metric.RAW_EVENTS, [], ctx)
    assert "COALESCE(sex, 'Unknown') AS sex" in plan.sql
    assert "COALESCE(age_bucket, 'Unknown') AS age_bucket" in plan.sql

