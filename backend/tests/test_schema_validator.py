from types import SimpleNamespace

import pytest

import backend.app.analytics.schema_validator as schema_validator
from backend.app.analytics.schema_validator import (
    EVENT_COLUMNS,
    TableValidationResult,
    validate_events_table,
)



@pytest.fixture(autouse=True)
def _mock_bigquery(monkeypatch):
    monkeypatch.setattr(schema_validator, 'bigquery', object())


class FakeClient:
    def __init__(self, table):
        self._table = table

    def get_table(self, table_id):  # pragma: no cover - simple passthrough
        return self._table


class FakePartition:
    def __init__(self, field=None):
        self.field = field


def build_table(columns, partition_field="timestamp", clustering=("site_id", "cam_id")):
    schema = [SimpleNamespace(name=name) for name in columns]
    table = SimpleNamespace(
        schema=schema,
        time_partitioning=FakePartition(partition_field) if partition_field else None,
        clustering_fields=list(clustering),
    )
    return table


def test_validate_events_table_passes_with_expected_configuration():
    table = build_table(EVENT_COLUMNS)
    client = FakeClient(table)
    result = validate_events_table(client, "nigzsu.client_events.client0")

    assert isinstance(result, TableValidationResult)
    assert result.is_valid
    assert result.partition_field == "timestamp"
    assert result.clustering_fields == ["site_id", "cam_id"]


def test_validate_events_table_detects_missing_columns_and_partitioning():
    columns = [c for c in EVENT_COLUMNS if c != "age_bucket"]
    table = build_table(columns, partition_field=None, clustering=("site_id",))
    client = FakeClient(table)

    result = validate_events_table(client, "nigzsu.client_events.client1")

    assert not result.is_valid
    assert result.missing_columns == ["age_bucket"]
    assert "table is not time partitioned" in result.issues
    assert "clustering fields do not match expected order" in result.issues


def test_validate_events_table_flags_unexpected_columns_and_partition_field():
    columns = list(EVENT_COLUMNS) + ["extra_col"]
    table = build_table(columns, partition_field="created_at")
    client = FakeClient(table)

    result = validate_events_table(client, "nigzsu.client_events.client2")

    assert not result.is_valid
    assert result.unexpected_columns == ["extra_col"]
    assert "partitioned on 'created_at'" in " ".join(result.issues)
