import copy
import sys
from pathlib import Path

import pandas as pd

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.app.analytics import SpecCompiler
from backend.app.analytics.compiler import CompilerContext


def test_vrm_occupancy_compiles_soft_anchor_pipeline():
    spec = {
        "id": "dashboard.kpi.vrm.occupancy",
        "dataset": "events",
        "chartType": "single_value",
        "measures": [
            {
                "id": "occupancy",
                "aggregation": "occupancy_recursion",
                "options": {"vrmOccupancy": True},
            }
        ],
        "dimensions": [
            {"id": "timestamp", "column": "timestamp", "bucket": "15_MIN"},
        ],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-02T00:00:00Z",
            "bucket": "15_MIN",
            "timezone": "UTC",
        },
    }

    compiler = SpecCompiler()
    context = CompilerContext(table_name="project.dataset.table")
    compiled = compiler.compile(spec, context)

    sql = compiled.sql
    assert "occupancy_occupancy_anchor" in sql
    assert "occupancy_occupancy_deltas" in sql
    assert "MIN(IF(cumulative.bucket_start >= anchor.anchor_ts" in sql
    assert "seeded_by_exit" not in sql


def test_vrm_kpis_use_bucket_start_instead_of_raw_timestamp():
    spec = {
        "id": "dashboard.kpi.vrm.footfall",
        "dataset": "events",
        "chartType": "single_value",
        "measures": [
            {"id": "footfall", "aggregation": "count", "eventTypes": [0, 1]},
        ],
        "dimensions": [{"id": "timestamp", "column": "timestamp", "bucket": "15_MIN"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-02T00:00:00Z",
            "bucket": "15_MIN",
            "timezone": "UTC",
        },
    }

    compiler = SpecCompiler()
    context = CompilerContext(table_name="project.dataset.table")
    compiled = compiler.compile(spec, context)

    sql = compiled.sql
    assert "TIMESTAMP_ADD(bucket_start" in sql
    assert "COUNT(*) AS event_count" in sql
    assert "GROUP BY bucket_start" in sql
    assert "DIV(UNIX_SECONDS(timestamp)" in sql
    assert "TIMESTAMP_ADD(timestamp" not in sql


def test_standard_occupancy_remains_unchanged():
    spec = {
        "id": "live-flow",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [
            {"id": "occupancy", "aggregation": "occupancy_recursion"},
        ],
        "dimensions": [{"id": "timestamp", "column": "timestamp", "bucket": "HOUR"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-01T06:00:00Z",
            "bucket": "HOUR",
            "timezone": "UTC",
        },
    }

    compiler = SpecCompiler()
    context = CompilerContext(table_name="project.dataset.table")
    compiled = compiler.compile(spec, context)

    sql = compiled.sql
    assert "occupancy_deltas" in sql
    assert "seeded_by_exit" not in sql


def test_vrm_dwell_fifo_compiles_without_track_matching():
    vrm_spec = {
        "id": "dashboard.kpi.vrm.dwell",
        "dataset": "events",
        "chartType": "single_value",
        "measures": [
            {
                "id": "dwell",
                "aggregation": "dwell_mean",
                "options": {"vrmDwellFifo": True},
            }
        ],
        "dimensions": [{"id": "timestamp", "column": "timestamp", "bucket": "15_MIN"}],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-01T06:00:00Z",
            "bucket": "15_MIN",
            "timezone": "UTC",
        },
    }

    compiler = SpecCompiler()
    context = CompilerContext(table_name="project.dataset.table")
    compiled_vrm = compiler.compile(vrm_spec, context)

    sql = compiled_vrm.sql
    assert "dwell_dwell_events" in sql
    assert "entrance_count - exit_count" in sql
    assert "matched_seq" in sql
    assert "prev_matched_seq" in sql
    assert "matched_seq > prev_matched_seq" in sql
    assert "entrance.entrance_seq = e.matched_seq" in sql
    assert "PARTITION BY site_id, cam_id" in sql
    assert (
        "PARTITION BY site_id, cam_id, track_id\n                        ORDER BY timestamp, index\n                    ) AS rn\n                FROM scoped\n                WHERE event = 1"
        not in sql
    )
    assert "AND e.track_id = x.track_id" not in sql

    standard_spec = copy.deepcopy(vrm_spec)
    standard_spec["measures"][0]["options"] = {}
    compiled_standard = compiler.compile(standard_spec, context)
    standard_sql = compiled_standard.sql
    assert "PARTITION BY site_id, cam_id, track_id" in standard_sql
    assert "AND e.track_id = x.track_id" in standard_sql


def test_reflection_helper_never_negative():
    deltas = pd.Series([-5, 2, 2, -3, 4])
    running_sum = deltas.cumsum()
    running_min = running_sum.cummin().clip(upper=0)
    reflected = running_sum - running_min

    assert reflected.min() >= 0
    assert list(reflected) == [0, 2, 4, 1, 5]


def test_vrm_dwell_fifo_queue_discards_early_exits_and_pairs_in_order():
    events = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                [
                    "2024-01-01T00:00:00Z",  # early exit
                    "2024-01-01T00:05:00Z",  # entrance 1
                    "2024-01-01T00:10:00Z",  # entrance 2
                    "2024-01-01T00:15:00Z",  # exit for entrance 1
                    "2024-01-01T00:20:00Z",  # exit for entrance 2
                ]
            ),
            "event": [0, 1, 1, 0, 0],
        }
    )

    events["entrance_count"] = (events["event"] == 1).cumsum()
    events["exit_count"] = (events["event"] == 0).cumsum()
    events["balance"] = events["entrance_count"] - events["exit_count"]
    events["min_balance"] = events["balance"].cummin()

    exits = events[events["event"] == 0].copy()
    exits["matched_seq"] = exits["exit_count"] + exits["min_balance"].clip(upper=0)
    exits["prev_matched_seq"] = exits["matched_seq"].shift(fill_value=0)
    exits = exits[exits["matched_seq"] > exits["prev_matched_seq"]]

    entrances = events[events["event"] == 1].reset_index(drop=True)
    entrances["entrance_seq"] = entrances.index + 1

    assert list(exits["matched_seq"]) == [1, 2]

    paired = exits.merge(
        entrances, left_on="matched_seq", right_on="entrance_seq", suffixes=("_exit", "_entrance")
    )
    dwell_minutes = (
        (paired["timestamp_exit"] - paired["timestamp_entrance"])  # type: ignore[index]
        .dt.total_seconds()
        / 60.0
    )

    assert all(dwell_minutes >= 0)
    assert dwell_minutes.tolist() == [10.0, 10.0]


def test_vrm_capacity_compiles_with_vrm_occupancy_pipeline():
    spec = {
        "id": "dashboard.kpi.vrm.capacity_usage",
        "dataset": "events",
        "chartType": "single_value",
        "measures": [
            {
                "id": "occupancy",
                "aggregation": "occupancy_recursion",
                "options": {"vrmOccupancy": True},
            }
        ],
        "dimensions": [
            {"id": "timestamp", "column": "timestamp", "bucket": "15_MIN"},
        ],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-02T00:00:00Z",
            "bucket": "15_MIN",
            "timezone": "UTC",
        },
    }

    compiler = SpecCompiler()
    context = CompilerContext(table_name="project.dataset.table")
    compiled = compiler.compile(spec, context)

    sql = compiled.sql
    assert "occupancy_occupancy_anchor" in sql
    assert "occupancy_occupancy_deltas" in sql
    assert "MIN(IF(cumulative.bucket_start >= anchor.anchor_ts" in sql
    assert "seeded_by_exit" not in sql

