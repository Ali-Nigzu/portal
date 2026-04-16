"""Local SQLite-backed event-log search helpers for demo flows."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app.services.local_data import LocalDataError
from backend.app.services.demo_time import format_demo_timestamp


def _normalize_optional_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    text = value.strip()
    if text == "":
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _resolve_event_filter(event: Optional[str]) -> Optional[int]:
    if not event:
        return None
    normalized = event.strip().lower()
    if normalized in {"all", ""}:
        return None
    if normalized in {"entry", "entrance", "1"}:
        return 1
    if normalized in {"exit", "0"}:
        return 0
    return None


def _resolve_sex_filter(sex: Optional[str]) -> Optional[int]:
    if not sex:
        return None
    normalized = sex.strip().lower()
    if normalized in {"all", ""}:
        return None
    if normalized in {"0", "m", "male"}:
        return 0
    if normalized in {"1", "f", "female"}:
        return 1
    return None


def _resolve_timestamp(value: datetime) -> str:
    return format_demo_timestamp(value.replace(tzinfo=None) if value.tzinfo else value)


def search_events_from_sqlite(
    db_path: Path,
    *,
    start: datetime,
    end: datetime,
    event: Optional[str],
    sex: Optional[str],
    age: Optional[str],
    race: Optional[str],
    site_id: Optional[str],
    camera_id: Optional[str],
    track_id: Optional[str],
    page: int,
    per_page: int,
) -> Dict[str, Any]:
    if not db_path.exists():
        raise LocalDataError(f"Missing combined logs SQLite database at {db_path}")

    where: List[str] = [
        "datetime(replace(CAST(timestamp AS TEXT), ' UTC', '')) BETWEEN datetime(?) AND datetime(?)",
    ]
    params: List[Any] = [_resolve_timestamp(start), _resolve_timestamp(end)]

    event_filter = _resolve_event_filter(event)
    if event_filter is not None:
        where.append("CAST(event AS INTEGER) = ?")
        params.append(event_filter)

    sex_filter = _resolve_sex_filter(sex)
    if sex_filter is not None:
        where.append("CAST(sex AS INTEGER) = ?")
        params.append(sex_filter)

    age_filter = _normalize_optional_int(age)
    if age_filter is not None:
        where.append("CAST(age_bucket AS INTEGER) = ?")
        params.append(age_filter)

    race_filter = _normalize_optional_int(race)
    if race_filter is not None:
        where.append("CAST(race AS INTEGER) = ?")
        params.append(race_filter)

    site_filter = _normalize_optional_int(site_id)
    if site_filter is not None:
        where.append("CAST(site_id AS INTEGER) = ?")
        params.append(site_filter)

    camera_filter = _normalize_optional_int(camera_id)
    if camera_filter is not None:
        where.append("CAST(cam_id AS INTEGER) = ?")
        params.append(camera_filter)

    if track_id:
        cleaned_track = track_id.strip().lstrip("#").strip().lower()
        if cleaned_track:
            where.append("LOWER(CAST(track_id AS TEXT)) LIKE ?")
            params.append(f"%{cleaned_track}%")

    where_clause = " AND ".join(where)
    count_sql = f"SELECT COUNT(*) FROM logs WHERE {where_clause}"
    offset = max(page - 1, 0) * per_page

    rows_sql = (
        "SELECT site_id, cam_id, track_id, event, timestamp, sex, age_bucket, race "
        "FROM logs "
        f"WHERE {where_clause} "
        "ORDER BY datetime(replace(CAST(timestamp AS TEXT), ' UTC', '')) DESC "
        "LIMIT ? OFFSET ?"
    )

    try:
        conn = sqlite3.connect(str(db_path))
        total_count = int(conn.execute(count_sql, params).fetchone()[0])
        if total_count == 0:
            return {
                "events": [],
                "total": 0,
                "page": page,
                "per_page": per_page,
                "total_pages": 0,
            }

        rows = conn.execute(rows_sql, [*params, per_page, offset]).fetchall()
    except sqlite3.Error as exc:
        raise LocalDataError(f"Failed querying combined logs DB {db_path}: {exc}") from exc
    finally:
        try:
            conn.close()
        except Exception:
            pass

    events: List[Dict[str, Any]] = []
    for row in rows:
        events.append(
            {
                "site_id": row[0],
                "cam_id": row[1],
                "track_number": row[2],
                "track_id": row[2],
                "event": "entry" if int(row[3]) == 1 else "exit",
                "timestamp": str(row[4]),
                "sex": row[5],
                "age_estimate": row[6],
                "race": row[7],
            }
        )

    return {
        "events": events,
        "total": total_count,
        "page": page,
        "per_page": per_page,
        "total_pages": (total_count + per_page - 1) // per_page,
    }
