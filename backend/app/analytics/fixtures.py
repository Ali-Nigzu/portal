"""Utilities for working with analytics fixtures and expected outputs."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = ROOT / "shared" / "analytics" / "fixtures" / "events_golden_client0.csv"


@dataclass
class FixtureSession:
    site_id: str
    cam_id: str
    track_no: str
    entrance_ts: pd.Timestamp
    exit_ts: pd.Timestamp
    dwell_minutes: float


def load_events() -> pd.DataFrame:
    """Load the canonical golden dataset as a pandas DataFrame."""
    df = pd.read_csv(
        FIXTURE_PATH,
        parse_dates=["timestamp"],
        dtype={
            "site_id": "string",
            "cam_id": "string",
            "index": "int64",
            "track_no": "string",
            "event_type": "int64",
            "sex": "string",
            "age_bucket": "string",
        },
    )
    df.sort_values(["timestamp", "index"], inplace=True)
    if df['timestamp'].dt.tz is None:
        df['timestamp'] = df['timestamp'].dt.tz_localize('UTC')
    else:
        df['timestamp'] = df['timestamp'].dt.tz_convert('UTC')
    return df


def derive_sessions(events: pd.DataFrame) -> List[FixtureSession]:
    """Pair entrances/exits per the development plan rules."""
    entrances = events[events["event_type"] == 1].copy()
    exits = events[events["event_type"] == 0].copy()
    entrances["rn"] = entrances.groupby(["site_id", "cam_id", "track_no"]).cumcount()
    exits["rn"] = exits.groupby(["site_id", "cam_id", "track_no"]).cumcount()

    merged = entrances.merge(
        exits,
        on=["site_id", "cam_id", "track_no", "rn"],
        suffixes=("_entrance", "_exit"),
        how="left",
    )
    merged.dropna(subset=["timestamp_exit"], inplace=True)
    merged["dwell_minutes"] = (
        (merged["timestamp_exit"] - merged["timestamp_entrance"]).dt.total_seconds()
        / 60.0
    )
    merged = merged[(merged["dwell_minutes"] >= 0) & (merged["dwell_minutes"] <= 360)]

    sessions: List[FixtureSession] = []
    for row in merged.itertuples():
        sessions.append(
            FixtureSession(
                site_id=row.site_id,
                cam_id=row.cam_id,
                track_no=row.track_no,
                entrance_ts=row.timestamp_entrance,
                exit_ts=row.timestamp_exit,
                dwell_minutes=float(round(row.dwell_minutes, 6)),
            )
        )
    return sessions


def event_time_buckets(
    events: pd.DataFrame,
    start: pd.Timestamp,
    end: pd.Timestamp,
    bucket_minutes: int,
) -> pd.DataFrame:
    """Aggregate occupancy, entrances, exits, and throughput per bucket."""
    if start.tzinfo is None:
        start = start.tz_localize("UTC")
    if end.tzinfo is None:
        end = end.tz_localize("UTC")

    scoped = events[(events["timestamp"] >= start) & (events["timestamp"] < end)].copy()
    if scoped.empty:
        raise ValueError("No events within the requested window")

    scoped["delta"] = scoped["event_type"].apply(lambda v: 1 if v == 1 else -1)
    scoped["site_occupancy"] = scoped.groupby("site_id")["delta"].cumsum().clip(lower=0)
    scoped["bucket"] = scoped["timestamp"].dt.floor(f"{bucket_minutes}min")

    bucket_summary = (
        scoped.groupby("bucket")
        .agg(
            occupancy_end=("site_occupancy", "last"),
            entrances=("event_type", lambda s: int((s == 1).sum())),
            exits=("event_type", lambda s: int((s == 0).sum())),
        )
        .sort_index()
    )

    all_buckets = pd.date_range(
        start=start.floor(f"{bucket_minutes}min"),
        end=end.floor(f"{bucket_minutes}min"),
        freq=f"{bucket_minutes}min",
        inclusive="left",
    )
    bucket_summary = bucket_summary.reindex(all_buckets)
    bucket_summary["occupancy_end"] = bucket_summary["occupancy_end"].ffill()
    bucket_summary.fillna({"occupancy_end": 0, "entrances": 0, "exits": 0}, inplace=True)
    bucket_summary["throughput"] = (
        bucket_summary["entrances"] + bucket_summary["exits"]
    ) / bucket_minutes
    bucket_summary["coverage"] = bucket_summary[["entrances", "exits"]].sum(axis=1).gt(0).astype(float)
    bucket_summary.index.name = "bucket"
    return bucket_summary


def retention_matrix(events: pd.DataFrame, min_gap_minutes: int = 30) -> Dict[str, Dict[int, float]]:
    """Compute retention rates keyed by cohort week and lag weeks."""
    entrances = events[events["event_type"] == 1].copy()
    entrances.sort_values(["site_id", "track_no", "timestamp"], inplace=True)
    entrances["prev_ts"] = entrances.groupby(["site_id", "track_no"])["timestamp"].shift()
    entrances["minutes_since_prev"] = (
        (entrances["timestamp"] - entrances["prev_ts"]).dt.total_seconds() / 60.0
    )
    entrances["is_new_visit"] = entrances["prev_ts"].isna() | (
        entrances["minutes_since_prev"] >= min_gap_minutes
    )

    visits = entrances[entrances["is_new_visit"]].copy()
    cohort_start = (
        visits["timestamp"]
        .dt.tz_convert("UTC")
        .dt.tz_localize(None)
        .dt.to_period("W-MON")
        .dt.start_time
    )
    visits["cohort_week"] = cohort_start.dt.tz_localize("UTC")

    cohort_sizes = visits.groupby("cohort_week").size()
    retention: Dict[str, Dict[int, float]] = {}

    for (site_id, track_no), track_visits in visits.groupby(["site_id", "track_no"]):
        track_visits = track_visits.sort_values("timestamp")
        if track_visits.empty:
            continue
        first_visit = track_visits.iloc[0]
        cohort_week = first_visit.cohort_week
        key = cohort_week.isoformat().replace("+00:00", "Z")
        retention.setdefault(key, {})
        # Week zero retention is implicitly 1.0 when cohort size is non-zero.
        retention[key][0] = 1.0
        for ts in track_visits.iloc[1:]["timestamp"]:
            lag_weeks = int((ts - first_visit.timestamp).days // 7)
            # Floor for partial weeks.
            if lag_weeks < 0:
                continue
            total = cohort_sizes.get(cohort_week, 0)
            if total == 0:
                continue
            current = retention[key].get(lag_weeks, 0.0)
            retention[key][lag_weeks] = current + (1.0 / total)
    return retention
