"""Snapshot access helpers for snapshots-only deployments."""
from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from google.cloud import bigquery

from .services.bigquery_client import bigquery_client
from .services.demo_time import demo_now, format_demo_timestamp


SNAPSHOT_ORG_IDS = {"client1", "client2"}

_TIMESTAMP_COLUMN_CANDIDATES = ("ts", "timestamp", "snapshot_ts", "created_at")
_PAYLOAD_COLUMN_CANDIDATES = ("payload", "snapshot_payload", "data")
_FALLBACK_SNAPSHOT_PATH = Path("backend/data/demo_snapshot.json")


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


def _fallback_snapshot_row(org_id: str) -> SnapshotRow:
    if not _FALLBACK_SNAPSHOT_PATH.exists():
        raise SnapshotLookupError(
            f"Missing fallback snapshot fixture at {_FALLBACK_SNAPSHOT_PATH}"
        )
    raw = json.loads(_FALLBACK_SNAPSHOT_PATH.read_text(encoding="utf-8"))
    payload = _coerce_payload(raw.get("payload"))
    ts_raw = raw.get("ts")
    ts = str(ts_raw) if isinstance(ts_raw, str) and ts_raw else datetime.now(timezone.utc).isoformat()
    return SnapshotRow(org_id=_normalize_org_id(org_id), ts=ts, payload=payload)


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




def _sqlite_snapshot_table(conn: sqlite3.Connection) -> str:
    candidates = [
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]
    for table in candidates:
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if columns.intersection(_TIMESTAMP_COLUMN_CANDIDATES) and columns.intersection(_PAYLOAD_COLUMN_CANDIDATES):
            return table
    raise SnapshotLookupError("No snapshot table with timestamp/payload columns found in SQLite DB")


def fetch_latest_snapshot_from_sqlite(
    db_path: Path,
    *,
    org_id: str,
    as_of: Optional[datetime] = None,
) -> Optional[SnapshotRow]:
    normalized = _normalize_org_id(org_id)
    try:
        conn = sqlite3.connect(str(db_path))
    except sqlite3.Error as exc:
        raise SnapshotLookupError(f"Failed to open local snapshot DB {db_path}: {exc}") from exc

    try:
        table_name = _sqlite_snapshot_table(conn)
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()}
        ts_column = _select_column(columns, _TIMESTAMP_COLUMN_CANDIDATES, "timestamp")
        payload_column = _select_column(columns, _PAYLOAD_COLUMN_CANDIDATES, "payload")
        resolved_as_of_dt = as_of.replace(tzinfo=None) if as_of else demo_now().replace(tzinfo=None)
        resolved_as_of = format_demo_timestamp(resolved_as_of_dt)
        query = (
            f"SELECT {ts_column} AS ts, {payload_column} AS payload "
            f"FROM {table_name} "
            f"WHERE datetime(replace(CAST({ts_column} AS TEXT), ' UTC', '')) <= datetime(?) "
            f"ORDER BY datetime(replace(CAST({ts_column} AS TEXT), ' UTC', '')) DESC "
            "LIMIT 1"
        )
        row = conn.execute(query, (resolved_as_of,)).fetchone()
        if row is None:
            return None
        ts_value = row[0]
        payload_value = row[1]
        return SnapshotRow(
            org_id=normalized,
            ts=_format_timestamp(ts_value),
            payload=_coerce_payload(payload_value),
        )
    except sqlite3.Error as exc:
        raise SnapshotLookupError(f"SQLite snapshot lookup failed for {db_path}: {exc}") from exc
    finally:
        conn.close()

def fetch_latest_snapshot(org_id: str, *, as_of: Optional[datetime] = None) -> Optional[SnapshotRow]:
    normalized = _normalize_org_id(org_id)
    if not os.getenv("BQ_PROJECT") or not os.getenv("BQ_DATASET"):
        return _fallback_snapshot_row(normalized)

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
