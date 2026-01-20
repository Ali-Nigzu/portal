from __future__ import annotations

from copy import deepcopy

import pandas as pd

from backend.app.analytics import AnalyticsEngine, LocalCacheBackend, SpecCache, TableRouter
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec


class BoundsStubBigQueryClient:
    def __init__(self, bounds_frame: pd.DataFrame, data_frame: pd.DataFrame) -> None:
        self.bounds_frame = bounds_frame
        self.data_frame = data_frame
        self.calls: list[dict[str, object]] = []

    def query_dataframe(self, sql: str, params: dict, job_context: str | None = None) -> pd.DataFrame:
        self.calls.append({"sql": sql, "params": dict(params), "job_context": job_context})
        if "min_ts" in sql and "max_ts" in sql:
            return self.bounds_frame.copy()
        return self.data_frame.copy()


def _build_engine(stub: BoundsStubBigQueryClient) -> AnalyticsEngine:
    cache = SpecCache(LocalCacheBackend(), default_ttl=60)
    return AnalyticsEngine(
        table_router=TableRouter({"client0": "camosbase.dataset.client0"}),
        bigquery_client=stub,
        cache=cache,
    )


def test_live_flow_all_time_rewrites_epoch_bounds() -> None:
    spec = deepcopy(get_dashboard_spec("dashboard.live_flow"))
    spec["timeWindow"]["from"] = "1970-01-01T00:00:00Z"
    spec["timeWindow"]["to"] = "2024-01-01T00:00:00Z"

    bounds_frame = pd.DataFrame(
        [{"min_ts": pd.Timestamp("2022-01-01T00:00:00Z"), "max_ts": pd.Timestamp("2024-01-01T00:00:00Z")}]
    )
    data_frame = pd.DataFrame(
        [
            {
                "measure_id": "occupancy",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 1.0,
                "coverage": 1.0,
                "raw_count": 1,
            }
        ]
    )
    stub = BoundsStubBigQueryClient(bounds_frame, data_frame)
    engine = _build_engine(stub)

    engine.execute(spec, organisation="client0", bypass_cache=True)

    assert len(stub.calls) == 2
    compiled_params = stub.calls[1]["params"]
    assert str(compiled_params["start_ts"]).startswith("2022-01-01T00:00:00")
    assert str(compiled_params["end_ts"]).startswith("2024-01-01T00:00:00")


def test_live_flow_all_time_empty_bounds_returns_empty_series() -> None:
    spec = deepcopy(get_dashboard_spec("dashboard.live_flow"))
    spec["timeWindow"]["from"] = "1970-01-01T00:00:00Z"
    spec["timeWindow"]["to"] = "2024-01-01T00:00:00Z"

    bounds_frame = pd.DataFrame([{"min_ts": None, "max_ts": None}])
    data_frame = pd.DataFrame()
    stub = BoundsStubBigQueryClient(bounds_frame, data_frame)
    engine = _build_engine(stub)

    result = engine.execute(spec, organisation="client0", bypass_cache=True)

    assert len(stub.calls) == 1
    assert result["chartType"] == "composed_time"
    assert all(series["data"] == [] for series in result["series"])
