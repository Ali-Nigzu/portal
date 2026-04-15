"""Local SQLite source selection for migrated demo flows."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


class LocalDataError(RuntimeError):
    """Raised when local migrated sources are missing or unreadable."""


SiteView = str


@dataclass(frozen=True)
class LocalDataPaths:
    combined_snapshots: Path
    site_a_snapshots: Path
    site_b_snapshots: Path
    combined_logs: Path


def resolve_site_view(value: Optional[str]) -> SiteView:
    normalized = (value or "").strip().lower()
    if normalized in {"all", "site-a", "site_b", "site-b", "sitea", "site_a", "siteb"}:
        if normalized == "all":
            return "all"
        if normalized in {"site-a", "site_a", "sitea"}:
            return "site-a"
        return "site-b"
    return "site-a"


def local_data_paths() -> LocalDataPaths:
    return LocalDataPaths(
        combined_snapshots=Path(
            os.getenv("LOCAL_COMBINED_SNAPSHOTS_DB", "combined_logs_snapshots.db")
        ),
        site_a_snapshots=Path(
            os.getenv("LOCAL_SITE_A_SNAPSHOTS_DB", "user0_snapshots.db")
        ),
        site_b_snapshots=Path(
            os.getenv("LOCAL_SITE_B_SNAPSHOTS_DB", "user1_snapshots.db")
        ),
        combined_logs=Path(
            os.getenv("LOCAL_COMBINED_LOGS_DB", "combined_logs.db")
        ),
    )


def snapshot_db_for_site(site_view: SiteView) -> Path:
    paths = local_data_paths()
    if site_view == "all":
        return paths.combined_snapshots
    if site_view == "site-b":
        return paths.site_b_snapshots
    return paths.site_a_snapshots


def combined_logs_db() -> Path:
    return local_data_paths().combined_logs


def ensure_local_db_exists(path: Path, *, label: str) -> Path:
    if not path.exists():
        raise LocalDataError(f"Missing {label} SQLite database at {path}")
    if not path.is_file():
        raise LocalDataError(f"Invalid {label} SQLite database path {path}")
    return path
