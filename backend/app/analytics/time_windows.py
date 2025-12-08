"""Time window helpers for analytics specs."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict


DEFAULT_ANALYTICS_LOOKBACK_DAYS = 30


def ensure_time_window(
    spec: Dict[str, Any], *, now: datetime | None = None, default_timezone: str = "UTC"
) -> Dict[str, Any]:
    """Ensure a ChartSpec contains a bounded timeWindow.

    Mutates and returns the provided spec. If a timeWindow is already present, it is
    left unchanged aside from filling a missing timezone with ``default_timezone``.
    When absent, a default window spanning the last ``DEFAULT_ANALYTICS_LOOKBACK_DAYS``
    is applied.
    """

    if "timeWindow" in spec and spec.get("timeWindow"):
        time_window = spec["timeWindow"] or {}
        time_window.setdefault("timezone", default_timezone)
        spec["timeWindow"] = time_window
        return spec

    anchor = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    to = anchor
    since = to - timedelta(days=DEFAULT_ANALYTICS_LOOKBACK_DAYS)

    spec["timeWindow"] = {
        "from": since.isoformat(),
        "to": to.isoformat(),
        "timezone": default_timezone,
    }
    return spec

