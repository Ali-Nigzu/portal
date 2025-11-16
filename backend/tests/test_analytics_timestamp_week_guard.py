"""Guards against invalid TIMESTAMP WEEK arithmetic in compiled SQL."""
import re

from backend.app.analytics.data_contract import (
    Dimension,
    Metric,
    QueryContext,
    TimeRangeKey,
    compile_contract_query,
)


def _compile_sql(metric: Metric, dimensions: list[Dimension]) -> str:
    ctx = QueryContext(
        org_id="client0",
        table_name="project.dataset.client0",
        time_range=TimeRangeKey.ALL_TIME,
    )
    return compile_contract_query(metric, dimensions, ctx).sql


def test_compiled_sql_avoids_timestamp_week_intervals() -> None:
    pattern = re.compile(r"TIMESTAMP_(?:ADD|SUB)\([^)]*INTERVAL[^)]*WEEK", re.IGNORECASE)
    array_pattern = re.compile(r"GENERATE_TIMESTAMP_ARRAY\([^)]*INTERVAL[^)]*WEEK", re.IGNORECASE)

    plans = [
        _compile_sql(Metric.RETENTION_RATE, [Dimension.TIME, Dimension.RETENTION_LAG]),
        _compile_sql(Metric.ACTIVITY, [Dimension.TIME, Dimension.SITE]),
        _compile_sql(Metric.AVG_DWELL, [Dimension.TIME, Dimension.CAMERA]),
    ]

    for sql in plans:
        assert not pattern.search(sql)
        assert not array_pattern.search(sql)


def test_retention_calendar_uses_day_based_horizon() -> None:
    sql = _compile_sql(Metric.RETENTION_RATE, [Dimension.TIME, Dimension.RETENTION_LAG])
    window_filter = re.search(r"TIMESTAMP_SUB\(bounds.window_end,\s*INTERVAL\s+([0-9]+)\s+(\w+)", sql)
    assert window_filter, sql
    _, unit = window_filter.groups()
    assert unit.upper() == "DAY"
