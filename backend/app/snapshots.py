"""Snapshot access helpers for snapshots-only deployments."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from google.cloud import bigquery

from .bigquery_client import bigquery_client


SNAPSHOT_ORG_IDS = {"client1", "client2"}

_TIMESTAMP_COLUMN_CANDIDATES = ("ts", "timestamp", "snapshot_ts", "created_at")
_PAYLOAD_COLUMN_CANDIDATES = ("payload", "snapshot_payload", "data")


class SnapshotLookupError(RuntimeError):
    """Raised when snapshot data cannot be resolved."""


@dataclass(frozen=True)
class SnapshotRow:
    org_id: str
    ts: str
    payload: list[Any]


def _normalize_org_id(org_id: str) -> str:
    return org_id.strip().lower()


def is_snapshot_org(org_id: str) -> bool:
    return _normalize_org_id(org_id) in SNAPSHOT_ORG_IDS


def _snapshot_table_name() -> str:
    project = os.getenv("BQ_PROJECT")
    dataset = os.getenv("BQ_DATASET")
    if not project or not dataset:
        raise SnapshotLookupError("BQ_PROJECT and BQ_DATASET must be set for snapshot access")
    return f"{project}.{dataset}.snapshots"


def _select_column(columns: Iterable[str], candidates: Iterable[str], label: str) -> str:
    for candidate in candidates:
        if candidate in columns:
            return candidate
    raise SnapshotLookupError(f"Snapshot table missing required {label} column")


def _resolve_snapshot_columns() -> tuple[str, str, str]:
    client = bigquery_client._ensure_client()
    table_name = _snapshot_table_name()
    table = client.get_table(table_name)
    column_names = {field.name for field in table.schema}
    ts_column = _select_column(column_names, _TIMESTAMP_COLUMN_CANDIDATES, "timestamp")
    payload_column = _select_column(column_names, _PAYLOAD_COLUMN_CANDIDATES, "payload")
    return ts_column, payload_column


def _coerce_payload(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8")
    if isinstance(raw, str):
        raw = json.loads(raw)
    if isinstance(raw, list):
        return raw
    raise SnapshotLookupError("Snapshot payload is not a list")


def _format_timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def fetch_latest_snapshot(org_id: str, *, as_of: Optional[datetime] = None) -> Optional[SnapshotRow]:
    normalized = _normalize_org_id(org_id)
    table_name = _snapshot_table_name()
    ts_column, payload_column = _resolve_snapshot_columns()
    resolved_as_of = as_of or datetime.now(timezone.utc)

    sql = (
        f"SELECT {ts_column} AS ts, {payload_column} AS payload "
        f"FROM `{table_name}` "
        f"WHERE {ts_column} <= @as_of "
        f"ORDER BY {ts_column} DESC "
        f"LIMIT 1"
    )
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("as_of", "TIMESTAMP", resolved_as_of)]
    )
    client = bigquery_client._ensure_client()
    job = client.query(sql, job_config=job_config, location=bigquery_client.settings.location)
    result = job.result(page_size=1)
    row = next(iter(result), None)
    if not row:
        return None
    return SnapshotRow(
        org_id=normalized,
        ts=_format_timestamp(row["ts"]),
        payload=_coerce_payload(row["payload"]),
    )
