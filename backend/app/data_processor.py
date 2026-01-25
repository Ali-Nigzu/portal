"""Helpers for parsing and normalizing time range filters."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)

UTC = timezone.utc
DEFAULT_START = datetime(1970, 1, 1, tzinfo=UTC)
DEFAULT_END = datetime(2100, 1, 1, tzinfo=UTC)


def _parse_timestamp(value: Optional[str], *, is_end: bool = False) -> Optional[datetime]:
    """Parse ISO8601 or date-only strings into timezone-aware datetimes."""
    if not value:
        return None

    raw_value = value.strip()
    normalized = raw_value.replace("Z", "+00:00")

    dt: Optional[datetime]
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            dt = datetime.strptime(raw_value, "%Y-%m-%d")
        except ValueError:
            logger.warning("Unable to parse timestamp value '%s'; ignoring filter", raw_value)
            return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)

    if is_end and len(raw_value) <= 10:
        dt = dt + timedelta(days=1) - timedelta(microseconds=1)

    return dt


def _resolve_time_bounds(filters: Dict[str, Optional[str]]) -> Dict[str, datetime]:
    now = datetime.now(tz=UTC)
    start_ts = _parse_timestamp(filters.get("start_date")) or DEFAULT_START
    end_ts = _parse_timestamp(filters.get("end_date"), is_end=True) or now

    if end_ts > now:
        end_ts = now
    if start_ts > now:
        start_ts = now
        end_ts = now

    if start_ts > end_ts:
        start_ts, end_ts = end_ts, start_ts

    return {"start_ts": start_ts, "end_ts": end_ts}
