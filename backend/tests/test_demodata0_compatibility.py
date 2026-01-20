"""Scoped event adaptation behaviour for demodata0 sources."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

FIXTURE = Path(__file__).resolve().parents[2] / "shared" / "analytics" / "fixtures" / "events_demodata0_client0.csv"


def _materialise_scoped_projection(now: pd.Timestamp) -> pd.DataFrame:
    frame = pd.read_csv(FIXTURE, parse_dates=["timestamp"])
    filtered = frame[frame["timestamp"] < now].copy()
    filtered["sex"] = filtered["sex"].map({0: "Male", 1: "Female"})
    filtered["age_bucket"] = filtered["age_bucket"].map(
        {0: "0-4", 1: "5-13", 2: "14-25", 3: "26-45", 4: "46-65", 5: "66+"}
    )
    filtered.sort_values(["timestamp", "event", "track_id"], ascending=[True, False, True], inplace=True)
    filtered["index"] = (
        filtered.groupby(["site_id", "cam_id", "track_id"], sort=False).cumcount() + 1
    )
    return filtered


def test_demographics_map_without_unknowns():
    now = pd.Timestamp("2024-02-01T00:00:00Z")
    result = _materialise_scoped_projection(now)

    assert "T4" not in set(result["track_id"])  # future row filtered out
    assert set(result["sex"].unique()) == {"Male", "Female"}
    assert all(bucket in {"0-4", "5-13", "14-25", "26-45", "46-65", "66+"} for bucket in result["age_bucket"])


def test_synthetic_index_is_monotonic_per_track():
    now = pd.Timestamp("2024-02-01T00:00:00Z")
    result = _materialise_scoped_projection(now)

    for _, group in result.groupby(["site_id", "cam_id", "track_id"]):
        assert list(group["index"]) == list(range(1, len(group) + 1))


def test_simultaneous_events_order_entrances_before_exits():
    now = pd.Timestamp("2024-02-01T00:00:00Z")
    result = _materialise_scoped_projection(now)
    track_five = result[result["track_id"] == "T5"].sort_values("index")

    assert list(track_five["event"]) == [1, 0]
    assert list(track_five["index"]) == [1, 2]


def test_scoped_cte_projects_canonical_fields():
    from backend.app.analytics.compiler import SpecCompiler

    sql = SpecCompiler()._render_scoped(
        "project.dataset.client0", "", event_timestamp_column="timestamp"
    )

    assert "ROW_NUMBER() OVER" in sql
    normalized_sql = " ".join(sql.split())
    expected = (
        "CASE WHEN sex = 0 THEN 'Male' WHEN sex = 1 THEN 'Female' "
        "WHEN LOWER(CAST(sex AS STRING)) IN ('m', 'male') THEN 'Male' "
        "WHEN LOWER(CAST(sex AS STRING)) IN ('f', 'female') THEN 'Female' "
        "ELSE 'Unknown' END"
    )
    assert expected in normalized_sql
    assert "CASE" in sql and "age_bucket" in sql
    assert "timestamp < TIMESTAMP(@now)" in sql
