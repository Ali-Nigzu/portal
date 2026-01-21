import importlib
from pathlib import Path
import sys

import pytest
from google.api_core.exceptions import NotFound

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.app.analytics import org_config
from backend.app.bigquery_client import BigQueryClient


def test_resolved_table_query_surfaces_not_found(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "example")
    monkeypatch.setenv("BQ_DATASET", "demo_data")

    importlib.reload(org_config)
    original = dict(org_config.ORG_TABLE_MAP)

    try:
        table = org_config.resolve_table_for_org("clientA")
        assert table == "example.demo_data.clientA"

        captured_sql: dict[str, str] = {}

        class FakeClient:
            def query(self, sql, job_config=None, location=None):  # type: ignore[override]
                captured_sql["sql"] = sql
                raise NotFound("table not found")

        client = BigQueryClient()
        client._ensure_client = lambda: FakeClient()  # type: ignore[assignment]

        with pytest.raises(NotFound):
            client.query(f"SELECT 1 FROM `{table}` LIMIT 1", {})

        assert table in captured_sql["sql"]
    finally:
        org_config.override_org_table_map(original)
