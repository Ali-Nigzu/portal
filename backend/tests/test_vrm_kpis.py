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
    assert "seeded_by_exit" in sql
    assert "occupancy_occupancy_anchor" not in sql


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

