import copy
from typing import Any

import pandas as pd

from backend.app.analytics import AnalyticsEngine, LocalCacheBackend, SpecCache, TableRouter
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec


class StubBigQueryClient:
    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame
        self.calls = 0

    def query_dataframe(self, sql: str, params: dict, job_context: str | None = None) -> pd.DataFrame:  # noqa: ARG002
        self.calls += 1
        return self.frame.copy()


BASE_WINDOW = {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-01T02:00:00Z",
    "bucket": "HOUR",
    "timezone": "UTC",
}


def _with_window(spec_id: str) -> dict[str, Any]:
    spec = copy.deepcopy(get_dashboard_spec(spec_id))
    spec["timeWindow"] = copy.deepcopy(BASE_WINDOW)
    spec["dimensions"][0]["bucket"] = "HOUR"
    return spec


def test_kpi_bundle_reuses_single_query() -> None:
    frame = pd.DataFrame(
        [
            {
                "measure_id": "activity_total",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 3,
                "coverage": 1.0,
                "raw_count": 3,
            },
            {
                "measure_id": "entrances",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 2,
                "coverage": 1.0,
                "raw_count": 2,
            },
            {
                "measure_id": "avg_dwell",
                "bucket_start": pd.Timestamp("2024-01-01T00:00:00Z"),
                "value": 12.5,
                "coverage": 1.0,
                "raw_count": 1,
            },
        ]
    )

    stub = StubBigQueryClient(frame)
    engine = AnalyticsEngine(
        table_router=TableRouter({"clientA": "project.dataset.table"}),
        bigquery_client=stub,
        cache=SpecCache(LocalCacheBackend(), default_ttl=60),
    )

    activity_spec = _with_window("dashboard.kpi.activity_today")
    entrances_spec = _with_window("dashboard.kpi.entrances_today")
    dwell_spec = _with_window("dashboard.kpi.avg_dwell_today")

    activity = engine.execute(activity_spec, organisation="clientA")
    entrances = engine.execute(entrances_spec, organisation="clientA")
    dwell = engine.execute(dwell_spec, organisation="clientA")

    assert stub.calls == 1
    assert activity["series"][0]["id"] == "activity_total"
    assert entrances["series"][0]["id"] == "entrances"
    assert dwell["series"][0]["id"] == "avg_dwell"
