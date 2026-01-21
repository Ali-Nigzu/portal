"""Snapshot access helpers for snapshots-only deployments."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Optional

from google.cloud import bigquery

from .bigquery_client import bigquery_client


SNAPSHOT_ORG_IDS = {"client1", "client2"}

_ORG_COLUMN_CANDIDATES = ("org_id", "org", "client_id")
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
    org_column = _select_column(column_names, _ORG_COLUMN_CANDIDATES, "org")
    ts_column = _select_column(column_names, _TIMESTAMP_COLUMN_CANDIDATES, "timestamp")
    payload_column = _select_column(column_names, _PAYLOAD_COLUMN_CANDIDATES, "payload")
    return org_column, ts_column, payload_column


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


def fetch_latest_snapshot(org_id: str) -> Optional[SnapshotRow]:
    normalized = _normalize_org_id(org_id)
    table_name = _snapshot_table_name()
    org_column, ts_column, payload_column = _resolve_snapshot_columns()

    sql = (
        f"SELECT {ts_column} AS ts, {payload_column} AS payload "
        f"FROM `{table_name}` "
        f"WHERE {org_column} = @org_id "
        f"ORDER BY {ts_column} DESC "
        f"LIMIT 1"
    )
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("org_id", "STRING", normalized)]
    )
    client = bigquery_client._ensure_client()
    job = client.query(sql, job_config=job_config, location=bigquery_client.settings.location)
    rows = list(job.result())
    if not rows:
        return None
    row = rows[0]
    return SnapshotRow(
        org_id=normalized,
        ts=_format_timestamp(row["ts"]),
        payload=_coerce_payload(row["payload"]),
    )
