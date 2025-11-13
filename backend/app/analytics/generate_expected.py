"""Generate ChartResult JSON payloads from the golden fixtures."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

CURRENT_DIR = Path(__file__).resolve().parent
if __package__ is None or __package__ == "":
    sys.path.append(str(CURRENT_DIR))
    from fixtures import derive_sessions, event_time_buckets, load_events, retention_matrix
else:
    from .fixtures import derive_sessions, event_time_buckets, load_events, retention_matrix

ROOT = CURRENT_DIR.parents[2]
OUTPUT_DIR = ROOT / "shared" / "analytics" / "examples"


def _round(value: float) -> float:
    return float(np.round(value, 4))


def build_live_flow(events: pd.DataFrame) -> Dict:
    start = pd.Timestamp("2024-01-01T09:00:00Z")
    end = pd.Timestamp("2024-01-01T10:15:00Z")
    buckets = event_time_buckets(events, start=start, end=end, bucket_minutes=5)

    data_points = [
        {
            "x": bucket.isoformat().replace("+00:00", "Z"),
            "y": float(row.occupancy_end),
            "coverage": float(row.coverage),
            "rawCount": int(row.raw_count),
        }
        for bucket, row in buckets.iterrows()
    ]

    entrances = [
        {
            "x": bucket.isoformat().replace("+00:00", "Z"),
            "y": int(row.entrances),
            "coverage": float(row.coverage) if row.entrances > 0 else 0.0,
            "rawCount": int(row.entrances),
        }
        for bucket, row in buckets.iterrows()
    ]
    exits = [
        {
            "x": bucket.isoformat().replace("+00:00", "Z"),
            "y": int(row.exits),
            "coverage": float(row.coverage) if row.exits > 0 else 0.0,
            "rawCount": int(row.exits),
        }
        for bucket, row in buckets.iterrows()
    ]
    throughput = [
        {
            "x": bucket.isoformat().replace("+00:00", "Z"),
            "y": _round(row.throughput),
            "coverage": float(row.coverage) if row.raw_count > 0 else 0.0,
            "rawCount": int(row.raw_count),
        }
        for bucket, row in buckets.iterrows()
    ]

    coverage = [
        {"x": bucket.isoformat().replace("+00:00", "Z"), "value": float(row.coverage)}
        for bucket, row in buckets.iterrows()
    ]

    return {
        "chartType": "composed_time",
        "xDimension": {
            "id": "time",
            "type": "time",
            "bucket": "5_MIN",
            "timezone": "UTC",
        },
        "series": [
            {
                "id": "occupancy",
                "label": "Occupancy",
                "axis": "Y1",
                "unit": "people",
                "geometry": "area",
                "data": data_points,
                "summary": {
                    "max": float(buckets["occupancy_end"].max()),
                    "end": float(buckets["occupancy_end"].iloc[-1]),
                },
            },
            {
                "id": "throughput",
                "label": "Throughput",
                "axis": "Y2",
                "unit": "events/min",
                "geometry": "line",
                "data": throughput,
            },
            {
                "id": "entrances",
                "label": "Entrances",
                "axis": "Y3",
                "unit": "events",
                "geometry": "column",
                "stack": "flow",
                "data": entrances,
            },
            {
                "id": "exits",
                "label": "Exits",
                "axis": "Y3",
                "unit": "events",
                "geometry": "column",
                "stack": "flow",
                "data": exits,
            },
        ],
        "meta": {
            "bucketMinutes": 5,
            "timezone": "UTC",
            "coverage": coverage,
            "surges": [],
            "summary": {
                "occupancy_max": float(buckets["occupancy_end"].max()),
                "occupancy_end": float(buckets["occupancy_end"].iloc[-1]),
            },
        },
    }


def build_dwell(events: pd.DataFrame) -> Dict:
    sessions = derive_sessions(events)
    if not sessions:
        raise ValueError("Fixture dataset must produce sessions for dwell metrics")

    frame = pd.DataFrame([s.__dict__ for s in sessions])
    by_camera = frame.groupby("cam_id")["dwell_minutes"]
    averages = by_camera.mean().round(2)
    p90 = by_camera.quantile(0.9).round(2)

    camera_order = sorted(by_camera.groups.keys())
    avg_series = [
        {"x": cam, "y": float(averages.get(cam, 0.0)), "coverage": 1.0}
        for cam in camera_order
    ]
    p90_series = [
        {"x": cam, "y": float(p90.get(cam, 0.0))}
        for cam in camera_order
    ]

    return {
        "chartType": "categorical",
        "xDimension": {"id": "cam_id", "type": "category"},
        "series": [
            {
                "id": "avg_dwell",
                "label": "Average dwell",
                "unit": "minutes",
                "geometry": "bar",
                "data": avg_series,
                "summary": {
                    "overall_mean": float(frame["dwell_minutes"].mean().round(2)),
                    "sessions": int(frame.shape[0]),
                },
            },
            {
                "id": "p90_dwell",
                "label": "P90 dwell",
                "axis": "Y2",
                "unit": "minutes",
                "geometry": "line",
                "data": p90_series,
            },
        ],
        "meta": {
            "timezone": "UTC",
            "summary": {
                "session_count": int(frame.shape[0]),
            },
        },
    }


def build_demographics(events: pd.DataFrame) -> Dict:
    order = ["0-4", "5-13", "14-25", "26-45", "46-65", "66+", "Unknown"]
    demo = (
        events.groupby(["age_bucket", "sex"]).size().rename("count").reset_index()
    )
    demo["age_bucket"] = demo["age_bucket"].fillna("Unknown")
    demo["sex"] = demo["sex"].fillna("Unknown")

    totals = {tuple(row[:2]): int(row[2]) for row in demo.itertuples(index=False, name=None)}
    sexes = sorted({row.sex for row in demo.itertuples()})
    series: List[Dict] = []
    for sex in sexes:
        data = []
        for bucket in order:
            data.append({"x": bucket, "y": totals.get((bucket, sex), 0)})
        series.append(
            {
                "id": f"count_{sex.lower()}",
                "label": sex.title(),
                "geometry": "column",
                "stack": "demographics",
                "data": data,
            }
        )

    return {
        "chartType": "categorical",
        "xDimension": {"id": "age_bucket", "type": "category"},
        "series": series,
        "meta": {
            "timezone": "UTC",
            "summary": {
                "total_events": int(events.shape[0]),
                "unique_visitors": int(events[events["event_type"] == 1]["track_no"].nunique()),
            },
        },
    }


def build_retention(events: pd.DataFrame) -> Dict:
    matrix = retention_matrix(events)
    data_points: List[Dict] = []
    for cohort, lags in sorted(matrix.items()):
        for lag, rate in sorted(lags.items()):
            data_points.append(
                {
                    "x": cohort,
                    "group": f"Week {lag}",
                    "value": _round(rate),
                }
            )

    return {
        "chartType": "heatmap",
        "xDimension": {"id": "cohort_week", "type": "matrix", "label": "Cohort week"},
        "series": [
            {
                "id": "retention_rate",
                "label": "Weekly retention",
                "geometry": "heatmap",
                "data": data_points,
                "summary": {
                    "cohorts": len(matrix),
                },
            }
        ],
        "meta": {
            "timezone": "UTC",
            "notes": [
                "Week 0 is always 100% because it represents the cohort creation week.",
            ],
        },
    }


def main() -> None:
    events = load_events()
    charts = {
        "golden_dashboard_live_flow.json": build_live_flow(events),
        "golden_dwell_by_camera.json": build_dwell(events),
        "golden_demographics_by_age.json": build_demographics(events),
        "golden_retention_heatmap.json": build_retention(events),
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, payload in charts.items():
        output_path = OUTPUT_DIR / filename
        with output_path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        print(f"Wrote {output_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
