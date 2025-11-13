import json
from pathlib import Path

from backend.app.analytics import fixtures
from backend.app.analytics.generate_expected import (
    build_demographics,
    build_dwell,
    build_live_flow,
    build_retention,
)

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_DIR = ROOT / "shared" / "analytics" / "examples"


def _load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_golden_outputs_match_regenerated_results():
    events = fixtures.load_events()

    builders = [
        (build_live_flow, EXAMPLES_DIR / "golden_dashboard_live_flow.json"),
        (build_dwell, EXAMPLES_DIR / "golden_dwell_by_camera.json"),
        (build_demographics, EXAMPLES_DIR / "golden_demographics_by_age.json"),
        (build_retention, EXAMPLES_DIR / "golden_retention_heatmap.json"),
    ]

    for builder, path in builders:
        regenerated = builder(events)
        stored = _load_json(path)
        assert regenerated == stored, f"Mismatch for {path.name}"
