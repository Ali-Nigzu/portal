"""Demo-only wall-clock time helpers.

These utilities intentionally treat timestamps as naive business clock values.
No timezone conversion is applied.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

_TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S"


def _strip_utc_suffix(raw: str) -> str:
    value = raw.strip()
    if value.endswith(" UTC"):
        return value[:-4].strip()
    return value


def parse_demo_timestamp(value: str) -> datetime:
    """Parse demo timestamp text preserving wall-clock components."""
    normalized = _strip_utc_suffix(value).replace("T", " ")
    if "." in normalized:
        normalized = normalized.split(".", 1)[0]
    if len(normalized) == 10:
        return datetime.strptime(normalized, "%Y-%m-%d")
    return datetime.strptime(normalized, _TIMESTAMP_FORMAT)


def format_demo_timestamp(value: datetime) -> str:
    """Format demo clock timestamp in stable SQL-comparable form."""
    return value.strftime(_TIMESTAMP_FORMAT)


def demo_now() -> datetime:
    """Return demo 'now' in local wall-clock terms (naive datetime)."""
    configured_tz = os.getenv("DEMO_NOW_TIMEZONE", "Europe/London")
    try:
        tz = ZoneInfo(configured_tz)
    except Exception:
        tz = timezone.utc
    return datetime.now(tz).replace(tzinfo=None)


def start_of_day(value: datetime) -> datetime:
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def end_of_day(value: datetime) -> datetime:
    return value.replace(hour=23, minute=59, second=59, microsecond=999999)


def resolve_demo_bounds(
    start_date: Optional[str],
    end_date: Optional[str],
    *,
    now: Optional[datetime] = None,
) -> Tuple[datetime, datetime]:
    """Resolve date bounds for demo queries without timezone semantics."""
    resolved_now = (now or demo_now()).replace(microsecond=0)
    start = parse_demo_timestamp(start_date) if start_date else datetime(1970, 1, 1)

    if end_date:
        end = parse_demo_timestamp(end_date)
        if len(end_date.strip()) <= 10:
            end = end_of_day(end)
    else:
        end = resolved_now

    if end > resolved_now:
        end = resolved_now

    if start > end:
        start, end = end, start
    return start, end


def to_demo_date_key(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def add_days(value: datetime, days: int) -> datetime:
    return value + timedelta(days=days)
