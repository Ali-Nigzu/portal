import json
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.app.analytics.dashboard_catalogue import (
    DASHBOARD_SPEC_CATALOGUE,
    ManifestValidationError,
    get_dashboard_manifest,
    get_dashboard_spec,
    pin_widget_to_manifest,
    remove_widget_from_manifest,
)
from backend.app.analytics.contracts import validate_chart_spec


_FIXTURE_PATH = Path(__file__).resolve().parents[2] / "shared" / "analytics" / "examples" / "dashboard_manifest_client0.json"


def load_fixture() -> dict:
    with _FIXTURE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_dashboard_manifest_matches_fixture():
    manifest = get_dashboard_manifest("client0")
    assert manifest == load_fixture()


def test_dashboard_manifest_includes_time_controls():
    manifest = get_dashboard_manifest("client0")
    controls = manifest.get("timeControls")
    assert controls is not None
    option_ids = {option["id"] for option in controls.get("options", [])}
    assert controls.get("defaultTimeRangeId") in option_ids
    assert controls.get("timezone") == "UTC"


def test_pin_and_remove_widget_round_trip():
    widget_id = "kpi-custom-testing"
    manifest = get_dashboard_manifest("client0")
    assert all(widget["id"] != widget_id for widget in manifest["widgets"])

    pinned_manifest = pin_widget_to_manifest(
        org_id="client0",
        widget={
            "id": widget_id,
            "title": "Pinned activity",
            "kind": "kpi",
            "inlineSpec": get_dashboard_spec("dashboard.kpi.activity_today"),
        },
    )
    assert any(widget["id"] == widget_id for widget in pinned_manifest["widgets"])
    custom_widget = next(widget for widget in pinned_manifest["widgets"] if widget["id"] == widget_id)
    assert custom_widget.get("locked") is False
    assert widget_id in pinned_manifest["layout"]["kpiBand"]

    restored_manifest = remove_widget_from_manifest(
        org_id="client0",
        widget_id=widget_id,
    )
    assert all(widget["id"] != widget_id for widget in restored_manifest["widgets"])
    assert widget_id not in restored_manifest["layout"]["kpiBand"]


def test_locked_widgets_cannot_be_removed():
    manifest = get_dashboard_manifest("client0")
    locked_widget = manifest["widgets"][0]
    assert locked_widget.get("locked") is True
    with pytest.raises(ManifestValidationError):
        remove_widget_from_manifest(org_id="client0", widget_id=locked_widget["id"])


def test_pin_widget_is_idempotent():
    widget = {
        "id": "duplicate-check",
        "title": "Duplicate",
        "kind": "kpi",
        "inlineSpec": get_dashboard_spec("dashboard.kpi.activity_today"),
    }

    first = pin_widget_to_manifest(org_id="client0", widget=widget)
    assert any(w["id"] == "duplicate-check" for w in first["widgets"])

    second = pin_widget_to_manifest(org_id="client0", widget=widget)
    occurrences = [w for w in second["widgets"] if w["id"] == "duplicate-check"]
    assert len(occurrences) == 1
    assert second["layout"]["kpiBand"].count("duplicate-check") == 1

    remove_widget_from_manifest(org_id="client0", widget_id="duplicate-check")


def test_remove_missing_widget_is_noop():
    manifest_before = get_dashboard_manifest("client0")
    result = remove_widget_from_manifest(org_id="client0", widget_id="missing-widget")
    assert result == manifest_before


def test_chart_widgets_require_grid_placement():
    with pytest.raises(ManifestValidationError):
        pin_widget_to_manifest(
            org_id="client0",
            widget={
                "id": "invalid-chart",
                "title": "Invalid Chart",
                "kind": "chart",
                "inlineSpec": get_dashboard_spec("dashboard.live_flow"),
            },
            target_band="kpiBand",
        )


def test_manifest_state_rolls_back_on_error():
    manifest_before = get_dashboard_manifest("client0")
    duplicate_manifest = pin_widget_to_manifest(
        org_id="client0",
        widget={
            "id": manifest_before["widgets"][0]["id"],
            "title": "Collision",
            "kind": "kpi",
            "inlineSpec": get_dashboard_spec("dashboard.kpi.activity_today"),
        },
    )
    manifest_after = get_dashboard_manifest("client0")
    assert duplicate_manifest == manifest_before
    assert manifest_after == manifest_before


@pytest.mark.parametrize("spec_id", sorted(DASHBOARD_SPEC_CATALOGUE.keys()))
def test_dashboard_specs_validate(spec_id: str):
    spec = get_dashboard_spec(spec_id)
    # validate_chart_spec will raise on invalid spec
    validate_chart_spec(spec)
    assert spec["id"] == spec_id
