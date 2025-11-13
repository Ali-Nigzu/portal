"""Utilities for validating BigQuery CCTV event tables."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Sequence

try:  # pragma: no cover - optional dependency during tests
    from google.cloud import bigquery
except ImportError:  # pragma: no cover - fallback for type checking without BigQuery
    bigquery = None  # type: ignore

EVENT_COLUMNS: Sequence[str] = (
    "site_id",
    "cam_id",
    "index",
    "track_no",
    "event_type",
    "timestamp",
    "sex",
    "age_bucket",
)


@dataclass
class TableValidationResult:
    """Outcome of validating a BigQuery table against the canonical schema."""

    table_id: str
    missing_columns: List[str] = field(default_factory=list)
    unexpected_columns: List[str] = field(default_factory=list)
    partition_field: Optional[str] = None
    clustering_fields: List[str] = field(default_factory=list)
    issues: List[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.missing_columns and not self.issues

    def summary(self) -> str:
        parts = [f"Table {self.table_id}"]
        if self.missing_columns:
            parts.append(f"missing columns: {', '.join(self.missing_columns)}")
        if self.unexpected_columns:
            parts.append(f"unexpected columns: {', '.join(self.unexpected_columns)}")
        if self.partition_field is None:
            parts.append("not partitioned")
        if self.clustering_fields == []:
            parts.append("not clustered")
        if self.issues:
            parts.extend(self.issues)
        return "; ".join(parts)


def validate_events_table(
    client: "bigquery.Client",
    table_id: str,
    expected_partition_field: str = "timestamp",
    expected_clustering: Sequence[str] = ("site_id", "cam_id"),
) -> TableValidationResult:
    """Validate schema, partitioning, and clustering for an events table."""
    if bigquery is None:
        raise RuntimeError("google-cloud-bigquery must be installed to run validation")

    table = client.get_table(table_id)
    result = TableValidationResult(table_id=table_id)

    column_names = [schema_field.name for schema_field in table.schema]
    result.missing_columns = [col for col in EVENT_COLUMNS if col not in column_names]
    result.unexpected_columns = [name for name in column_names if name not in EVENT_COLUMNS]

    partitioning = getattr(table, "time_partitioning", None)
    if partitioning is None:
        result.issues.append("table is not time partitioned")
    else:
        field = partitioning.field or expected_partition_field
        result.partition_field = field
        if field != expected_partition_field:
            result.issues.append(
                f"partitioned on {field!r} instead of expected {expected_partition_field!r}"
            )
    clustering = getattr(table, "clustering_fields", None) or []
    result.clustering_fields = list(clustering)
    if tuple(clustering) != tuple(expected_clustering):
        result.issues.append(
            "clustering fields do not match expected order"
        )

    if result.missing_columns:
        result.issues.append("missing required columns")
    return result


def validate_multiple(
    client: "bigquery.Client",
    table_ids: Iterable[str],
    **kwargs,
) -> List[TableValidationResult]:
    """Validate a collection of tables, returning individual reports."""
    return [validate_events_table(client, table_id, **kwargs) for table_id in table_ids]
