from pathlib import Path
import sys

import pandas as pd

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.app.analytics import AnalyticsEngine, LocalCacheBackend, SpecCache, TableRouter, org_config


def _build_spec() -> dict:
    return {
        "id": "spec_table_resolution",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [
            {"id": "activity", "label": "Activity", "aggregation": "count"},
        ],
        "dimensions": [
            {"id": "timestamp", "column": "timestamp", "bucket": "HOUR", "sort": "asc"}
        ],
        "timeWindow": {
            "from": "2024-01-01T00:00:00Z",
            "to": "2024-01-01T03:00:00Z",
            "bucket": "HOUR",
            "timezone": "UTC",
        },
    }


def test_compiled_sql_targets_direct_table(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "nigzsu")
    monkeypatch.setenv("BQ_DATASET", "demodata0")

    original = dict(org_config.ORG_TABLE_MAP)
    org_config.override_org_table_map(org_config.build_org_table_map())

    try:
        table_name = org_config.resolve_table_for_org("client0")
        assert table_name == "nigzsu.demodata0.client0"
        captured: dict[str, object] = {}

        class CapturingClient:
            def query_dataframe(self, sql: str, params: dict, job_context: str | None = None):
                captured["sql"] = sql
                captured["params"] = params
                return pd.DataFrame(
                    columns=["measure_id", "bucket_start", "value", "coverage", "raw_count"]
                )

        engine = AnalyticsEngine(
            table_router=TableRouter({"client0": table_name}),
            bigquery_client=CapturingClient(),
            cache=SpecCache(LocalCacheBackend()),
        )

        engine.execute(_build_spec(), organisation="client0", bypass_cache=True)

        sql = captured.get("sql") or ""
        assert "client0_compat" not in sql
        assert "nigzsu.demodata0.client0" in sql
    finally:
        org_config.override_org_table_map(original)


def test_analytics_run_pipeline_uses_direct_table(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "nigzsu")
    monkeypatch.setenv("BQ_DATASET", "demodata0")

    import importlib
    import pandas as pd
    from fastapi.testclient import TestClient

    import backend.fastapi_app as fastapi_app
    importlib.reload(fastapi_app)
    import backend.app.analytics.org_config as org_config
    importlib.reload(org_config)

    original_map = dict(org_config.ORG_TABLE_MAP)
    org_config.override_org_table_map(org_config.build_org_table_map())

    try:
        captured: dict[str, object] = {}

        class CapturingClient:
            def query_dataframe(self, sql: str, params: dict, job_context: str | None = None):
                captured["sql"] = sql
                captured["params"] = params
                return pd.DataFrame(
                    columns=["measure_id", "bucket_start", "value", "coverage", "raw_count"]
                )

        fastapi_app.bigquery_client = CapturingClient()
        client = TestClient(fastapi_app.app)

        response = client.post(
            "/api/analytics/run",
            json={"spec": _build_spec(), "orgId": "client0", "bypassCache": True},
        )

        assert response.status_code == 200
        sql = captured.get("sql") or ""
        assert "client0_compat" not in sql
        assert "nigzsu.demodata0.client0" in sql
    finally:
        org_config.override_org_table_map(original_map)
