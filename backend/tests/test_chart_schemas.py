import json
from pathlib import Path

from backend.app.analytics.contracts import validate_chart_result, validate_chart_spec

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "shared" / "analytics" / "schemas"
EXAMPLES_DIR = ROOT / "shared" / "analytics" / "examples"


def _load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_chart_spec_schema_and_example_are_valid():
    schema = _load_json(SCHEMA_DIR / "chart-spec.schema.json")
    assert schema.get("$schema")
    example = _load_json(EXAMPLES_DIR / "chart-spec-example.json")
    validate_chart_spec(example)


def test_chart_result_schema_examples_are_valid():
    schema = _load_json(SCHEMA_DIR / "chart-result.schema.json")
    assert schema.get("$schema")
    example = _load_json(EXAMPLES_DIR / "chart-result-example.json")
    validate_chart_result(example)

    golden_files = sorted(EXAMPLES_DIR.glob("golden_*.json"))
    assert golden_files, "expected generated golden ChartResults"
    for golden in golden_files:
        payload = _load_json(golden)
        validate_chart_result(payload)
