import copy
from datetime import datetime, timezone

import pandas as pd

from backend.app.analytics import AnalyticsEngine, SpecCompiler
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec
from backend.app.analytics.cache import LocalCacheBackend, SpecCache
from backend.app.analytics.router import TableRouter
from backend.tests.test_analytics_engine_phase2 import StubBigQueryClient


def _build_stub_frame():
    bucket_a = datetime(2024, 1, 1, 9, 0, tzinfo=timezone.utc)
    bucket_b = datetime(2024, 1, 1, 9, 5, tzinfo=timezone.utc)
    rows = [
        {"measure_id": "occupancy", "bucket_start": bucket_a, "value": 3.0, "coverage": 1.0, "raw_count": 2},
        {"measure_id": "entrances", "bucket_start": bucket_a, "value": 2.0, "coverage": 1.0, "raw_count": 2},
        {"measure_id": "exits", "bucket_start": bucket_a, "value": 1.0, "coverage": 1.0, "raw_count": 1},
        {"measure_id": "throughput", "bucket_start": bucket_a, "value": 0.4, "coverage": 1.0, "raw_count": 2},
        {"measure_id": "occupancy", "bucket_start": bucket_b, "value": 5.0, "coverage": 1.0, "raw_count": 2},
        {"measure_id": "entrances", "bucket_start": bucket_b, "value": 3.0, "coverage": 1.0, "raw_count": 3},
        {"measure_id": "exits", "bucket_start": bucket_b, "value": 1.0, "coverage": 1.0, "raw_count": 1},
        {"measure_id": "throughput", "bucket_start": bucket_b, "value": 0.5, "coverage": 1.0, "raw_count": 2},
    ]
    return pd.DataFrame(rows)


def test_live_flow_normalizes_expected_series():
    spec = copy.deepcopy(get_dashboard_spec("dashboard.live_flow"))
    spec["timeWindow"] = {
        "from": "2024-01-01T09:00:00Z",
        "to": "2024-01-01T10:00:00Z",
        "bucket": "5_MIN",
        "timezone": "UTC",
    }

    frame = _build_stub_frame()
    engine = AnalyticsEngine(
        table_router=TableRouter({"org0": "project.dataset.table"}),
        bigquery_client=StubBigQueryClient(frame),
        cache=SpecCache(LocalCacheBackend(), default_ttl=60),
        compiler=SpecCompiler(),
    )

    result = engine.execute(spec, organisation="org0")

    series_by_id = {series["id"]: series for series in result["series"]}
    assert set(series_by_id.keys()) == {"occupancy", "entrances", "exits", "throughput"}
    assert series_by_id["occupancy"]["data"][-1]["y"] == 5.0
    assert series_by_id["occupancy"]["data"][0]["coverage"] == 1.0
