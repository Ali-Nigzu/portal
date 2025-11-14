"""Dashboard manifest + spec catalogue for Phase 5."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Optional, Protocol, Tuple

from .contracts import validate_chart_spec

ChartSpec = Dict[str, Any]
Manifest = Dict[str, Any]
Widget = Dict[str, Any]

_DEFAULT_TIMEZONE = "UTC"
_DEFAULT_GRID_COLUMNS = 12
_DEFAULT_GRID_HEIGHT = 8


def _single_value_spec(
    *,
    spec_id: str,
    measure_id: str,
    aggregation: str,
    label: str,
    time_bucket: str,
    time_from: str,
    time_to: str,
    event_types: Optional[Iterable[int]] = None,
) -> ChartSpec:
    measure: Dict[str, Any] = {"id": measure_id, "aggregation": aggregation}
    if event_types is not None:
        measure["eventTypes"] = list(event_types)
    spec: ChartSpec = {
        "id": spec_id,
        "dataset": "events",
        "chartType": "single_value",
        "measures": [measure],
        "dimensions": [
            {
                "id": "timestamp",
                "column": "timestamp",
                "bucket": time_bucket,
                "sort": "asc",
            }
        ],
        "timeWindow": {
            "from": time_from,
            "to": time_to,
            "bucket": time_bucket,
            "timezone": _DEFAULT_TIMEZONE,
        },
        "interactions": {"export": ["png", "csv"]},
        "displayHints": {"carryForward": True},
        "notes": [label],
    }
    return spec


DASHBOARD_SPEC_CATALOGUE: Mapping[str, ChartSpec] = {
    "dashboard.kpi.activity_today": _single_value_spec(
        spec_id="dashboard.kpi.activity_today",
        measure_id="activity_total",
        aggregation="count",
        label="Activity across entrances + exits",
        time_bucket="HOUR",
        time_from="{{TODAY_START}}",
        time_to="{{NOW}}",
    ),
    "dashboard.kpi.entrances_today": _single_value_spec(
        spec_id="dashboard.kpi.entrances_today",
        measure_id="entrances",
        aggregation="count",
        label="Entrances since local midnight",
        time_bucket="HOUR",
        time_from="{{TODAY_START}}",
        time_to="{{NOW}}",
        event_types=[1],
    ),
    "dashboard.kpi.exits_today": _single_value_spec(
        spec_id="dashboard.kpi.exits_today",
        measure_id="exits",
        aggregation="count",
        label="Exits since local midnight",
        time_bucket="HOUR",
        time_from="{{TODAY_START}}",
        time_to="{{NOW}}",
        event_types=[0],
    ),
    "dashboard.kpi.live_occupancy": {
        "id": "dashboard.kpi.live_occupancy",
        "dataset": "events",
        "chartType": "single_value",
        "measures": [
            {"id": "live_occupancy", "aggregation": "occupancy_recursion", "label": "Live occupancy"}
        ],
        "dimensions": [
            {
                "id": "timestamp",
                "column": "timestamp",
                "bucket": "5_MIN",
                "sort": "asc",
            }
        ],
        "timeWindow": {
            "from": "{{NOW_MINUS_60_MIN}}",
            "to": "{{NOW}}",
            "bucket": "5_MIN",
            "timezone": _DEFAULT_TIMEZONE,
        },
        "displayHints": {"carryForward": True},
        "interactions": {"export": ["png", "csv"]},
        "notes": ["Live occupancy mirrors final Live Flow point"],
    },
    "dashboard.kpi.avg_dwell_today": _single_value_spec(
        spec_id="dashboard.kpi.avg_dwell_today",
        measure_id="avg_dwell",
        aggregation="dwell_mean",
        label="Average dwell duration today",
        time_bucket="HOUR",
        time_from="{{TODAY_START}}",
        time_to="{{NOW}}",
    ),
    "dashboard.kpi.freshness_status": {
        "id": "dashboard.kpi.freshness_status",
        "dataset": "events",
        "chartType": "single_value",
        "measures": [
            {
                "id": "freshness_minutes",
                "aggregation": "count",
                "label": "Minutes since last event",
                "options": {"metric": "freshness"},
            }
        ],
        "dimensions": [
            {
                "id": "timestamp",
                "column": "timestamp",
                "bucket": "5_MIN",
                "sort": "asc",
            }
        ],
        "timeWindow": {
            "from": "{{NOW_MINUS_120_MIN}}",
            "to": "{{NOW}}",
            "bucket": "5_MIN",
            "timezone": _DEFAULT_TIMEZONE,
        },
        "displayHints": {"carryForward": True},
        "interactions": {"export": ["png", "csv"]},
        "notes": ["Backend emits freshness value + thresholds"],
    },
    "dashboard.live_flow": {
        "id": "dashboard.live_flow",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [
            {"id": "occupancy", "aggregation": "occupancy_recursion"},
            {"id": "entrances", "aggregation": "count", "eventTypes": [1]},
            {"id": "exits", "aggregation": "count", "eventTypes": [0]},
            {"id": "throughput", "aggregation": "activity_rate"},
        ],
        "dimensions": [
            {
                "id": "timestamp",
                "column": "timestamp",
                "bucket": "5_MIN",
                "sort": "asc",
            }
        ],
        "timeWindow": {
            "from": "{{NOW_MINUS_60_MIN}}",
            "to": "{{NOW}}",
            "bucket": "5_MIN",
            "timezone": _DEFAULT_TIMEZONE,
        },
        "interactions": {"zoom": True, "hoverSync": True, "seriesToggle": True, "export": ["png", "csv"]},
        "displayHints": {"carryForward": True, "y1Label": "People", "y2Label": "Events"},
        "notes": ["Live Flow chart used by dashboard + analytics presets"],
    },
}


for _spec in DASHBOARD_SPEC_CATALOGUE.values():
    validate_chart_spec(_spec)


DEFAULT_DASHBOARD_WIDGETS = [
    {
        "id": "kpi-activity-today",
        "title": "Activity Today",
        "kind": "kpi",
        "chartSpecId": "dashboard.kpi.activity_today",
        "fixtureId": "golden_dashboard_kpi_activity",
        "locked": True,
    },
    {
        "id": "kpi-entrances-today",
        "title": "Entrances Today",
        "kind": "kpi",
        "chartSpecId": "dashboard.kpi.entrances_today",
        "fixtureId": "golden_dashboard_kpi_entrances",
        "locked": True,
    },
    {
        "id": "kpi-exits-today",
        "title": "Exits Today",
        "kind": "kpi",
        "chartSpecId": "dashboard.kpi.exits_today",
        "fixtureId": "golden_dashboard_kpi_exits",
        "locked": True,
    },
    {
        "id": "kpi-live-occupancy",
        "title": "Live Occupancy",
        "kind": "kpi",
        "chartSpecId": "dashboard.kpi.live_occupancy",
        "fixtureId": "golden_dashboard_kpi_live_occupancy",
        "locked": True,
    },
    {
        "id": "kpi-avg-dwell",
        "title": "Avg Dwell",
        "kind": "kpi",
        "chartSpecId": "dashboard.kpi.avg_dwell_today",
        "fixtureId": "golden_dashboard_kpi_avg_dwell",
        "locked": True,
    },
    {
        "id": "kpi-freshness",
        "title": "Freshness Status",
        "kind": "kpi",
        "chartSpecId": "dashboard.kpi.freshness_status",
        "fixtureId": "golden_dashboard_kpi_freshness",
        "locked": True,
    },
    {
        "id": "live-flow",
        "title": "Live Flow (Last 60 min)",
        "kind": "chart",
        "chartSpecId": "dashboard.live_flow",
        "fixtureId": "golden_dashboard_live_flow",
        "subtitle": "Live occupancy, entrances, exits and throughput",
        "locked": True,
    },
]


DEFAULT_LAYOUT: Dict[str, Any] = {
    "kpiBand": [
        "kpi-activity-today",
        "kpi-entrances-today",
        "kpi-exits-today",
        "kpi-live-occupancy",
        "kpi-avg-dwell",
        "kpi-freshness",
    ],
    "grid": {
        "columns": _DEFAULT_GRID_COLUMNS,
        "placements": {
            "live-flow": {"x": 0, "y": 0, "w": _DEFAULT_GRID_COLUMNS, "h": _DEFAULT_GRID_HEIGHT},
        },
    },
}


DEFAULT_TIME_CONTROLS: Dict[str, Any] = {
    "defaultTimeRangeId": "last_24_hours",
    "timezone": _DEFAULT_TIMEZONE,
    "options": [
        {
            "id": "last_60_minutes",
            "label": "Last 60 minutes",
            "durationMinutes": 60,
            "bucket": "5_MIN",
        },
        {
            "id": "last_24_hours",
            "label": "Last 24 hours",
            "durationMinutes": 24 * 60,
            "bucket": "HOUR",
        },
        {
            "id": "last_7_days",
            "label": "Last 7 days",
            "durationMinutes": 7 * 24 * 60,
            "bucket": "DAY",
        },
    ],
}


_MANIFEST_TEMPLATES: Mapping[str, Manifest] = {
    "dashboard-default": {
        "id": "dashboard-default",
        "orgId": "template",
        "widgets": DEFAULT_DASHBOARD_WIDGETS,
        "layout": DEFAULT_LAYOUT,
        "timeControls": DEFAULT_TIME_CONTROLS,
    }
}


ManifestKey = Tuple[str, str]


class ManifestValidationError(ValueError):
    """Raised when a manifest or widget payload violates the schema contract."""


class ManifestRepository(Protocol):
    """Storage abstraction for dashboard manifests."""

    def load(self, org_id: str, dashboard_id: str) -> Manifest:
        """Return the stored manifest for the dashboard, bootstrapping from template if needed."""

    def save(self, org_id: str, dashboard_id: str, manifest: Manifest) -> None:
        """Persist the manifest for the dashboard."""

    def list(self) -> Dict[str, Manifest]:
        """Return all manifests keyed by repository identifier."""


class InMemoryManifestRepository:
    """Default in-memory repository used during Phase 6 rollout."""

    def __init__(self, templates: Mapping[str, Manifest]):
        self._templates = {key: deepcopy(value) for key, value in templates.items()}
        self._store: MutableMapping[ManifestKey, Manifest] = {}

    def _key(self, org_id: str, dashboard_id: str) -> ManifestKey:
        return org_id, dashboard_id

    def _bootstrap(self, org_id: str, dashboard_id: str) -> Manifest:
        key = self._key(org_id, dashboard_id)
        if key not in self._store:
            template = self._templates.get(dashboard_id)
            if template is None:
                raise KeyError(f"Unknown dashboard manifest: {dashboard_id}")
            manifest = deepcopy(template)
            manifest["orgId"] = org_id
            manifest["widgets"] = [deepcopy(widget) for widget in template.get("widgets", [])]
            manifest["layout"] = deepcopy(template.get("layout", {}))
            if template.get("timeControls"):
                manifest["timeControls"] = deepcopy(template["timeControls"])
            self._store[key] = manifest
        return self._store[key]

    def load(self, org_id: str, dashboard_id: str) -> Manifest:
        manifest = self._bootstrap(org_id, dashboard_id)
        return deepcopy(manifest)

    def save(self, org_id: str, dashboard_id: str, manifest: Manifest) -> None:
        key = self._key(org_id, dashboard_id)
        self._store[key] = deepcopy(manifest)

    def list(self) -> Dict[str, Manifest]:
        return {"::".join(key): deepcopy(value) for key, value in self._store.items()}


MANIFEST_REPOSITORY: ManifestRepository = InMemoryManifestRepository(_MANIFEST_TEMPLATES)


def _clone_for_response(manifest: Manifest, org_id: str) -> Manifest:
    clone = deepcopy(manifest)
    clone["orgId"] = org_id
    for widget in clone.get("widgets", []):
        if widget.get("inlineSpec") is None and widget.get("chartSpecId"):
            widget["inlineSpec"] = get_dashboard_spec(widget["chartSpecId"])
    return clone


def _load_manifest(org_id: str, dashboard_id: str) -> Manifest:
    return MANIFEST_REPOSITORY.load(org_id, dashboard_id)


def _save_manifest(org_id: str, dashboard_id: str, manifest: Manifest) -> None:
    MANIFEST_REPOSITORY.save(org_id, dashboard_id, manifest)


def _validate_widget(widget: Widget) -> None:
    widget_id = widget.get("id")
    if not widget_id or not isinstance(widget_id, str):
        raise ManifestValidationError("Widget must include a string id")
    kind = widget.get("kind")
    if kind not in {"kpi", "chart"}:
        raise ManifestValidationError(f"Unsupported widget kind: {kind}")
    inline_spec = widget.get("inlineSpec")
    spec_id = widget.get("chartSpecId")
    locked = widget.get("locked")
    if locked is not None and not isinstance(locked, bool):
        raise ManifestValidationError("Widget locked flag must be a boolean when provided")
    if inline_spec is None and not spec_id:
        raise ManifestValidationError("Widget must include chartSpecId or inlineSpec")
    if inline_spec is not None:
        validate_chart_spec(inline_spec)
    elif spec_id:
        widget["inlineSpec"] = get_dashboard_spec(spec_id)


def _ensure_layout_scaffolding(manifest: Manifest) -> None:
    manifest.setdefault("layout", {})
    layout = manifest["layout"]
    layout.setdefault("kpiBand", [])
    layout.setdefault("grid", {})
    grid = layout["grid"]
    grid.setdefault("columns", _DEFAULT_GRID_COLUMNS)
    grid.setdefault("placements", {})


def _validate_manifest(manifest: Manifest) -> None:
    _ensure_layout_scaffolding(manifest)
    widgets = manifest.setdefault("widgets", [])
    if not isinstance(widgets, list):
        raise ManifestValidationError("Manifest widgets must be an array")

    widget_lookup: Dict[str, Widget] = {}
    for raw_widget in widgets:
        if not isinstance(raw_widget, dict):
            raise ManifestValidationError("Widgets must be objects")
        widget = deepcopy(raw_widget)
        _validate_widget(widget)
        widget_id = widget["id"]
        if widget_id in widget_lookup:
            raise ManifestValidationError(f"Duplicate widget id: {widget_id}")
        widget_lookup[widget_id] = widget

    layout = manifest["layout"]
    kpi_band = layout.get("kpiBand", [])
    if not isinstance(kpi_band, list):
        raise ManifestValidationError("layout.kpiBand must be an array of widget ids")

    grid = layout.get("grid", {})
    if not isinstance(grid, dict):
        raise ManifestValidationError("layout.grid must be an object")

    columns = grid.get("columns", _DEFAULT_GRID_COLUMNS)
    if not isinstance(columns, int) or columns != _DEFAULT_GRID_COLUMNS:
        raise ManifestValidationError("layout.grid.columns must equal 12")

    placements = grid.get("placements", {})
    if not isinstance(placements, dict):
        raise ManifestValidationError("layout.grid.placements must be an object")

    for widget_id in kpi_band:
        if widget_id not in widget_lookup:
            raise ManifestValidationError(f"Unknown widget id in kpiBand: {widget_id}")
        if widget_lookup[widget_id].get("kind") != "kpi":
            raise ManifestValidationError(f"Non-KPI widget referenced in kpiBand: {widget_id}")

    for widget_id, placement in placements.items():
        if widget_id not in widget_lookup:
            raise ManifestValidationError(f"Unknown widget id in grid placements: {widget_id}")
        widget = widget_lookup[widget_id]
        if widget.get("kind") != "chart":
            raise ManifestValidationError(f"Non-chart widget cannot have a grid placement: {widget_id}")
        if not isinstance(placement, Mapping):
            raise ManifestValidationError(f"Invalid placement for widget: {widget_id}")
        for dimension in ("x", "y", "w", "h"):
            value = placement.get(dimension)
            if not isinstance(value, int):
                raise ManifestValidationError(
                    f"Grid placement value {dimension} must be an integer for widget {widget_id}"
                )
        if placement["w"] < 1 or placement["w"] > columns:
            raise ManifestValidationError(f"Grid width out of bounds for widget {widget_id}")
        if placement["h"] < 1:
            raise ManifestValidationError(f"Grid height must be >= 1 for widget {widget_id}")

    for widget_id, widget in widget_lookup.items():
        if widget.get("kind") == "chart" and widget_id not in placements:
            raise ManifestValidationError(f"Chart widget missing grid placement: {widget_id}")
        if widget.get("kind") == "kpi" and widget_id in placements:
            raise ManifestValidationError(f"KPI widget cannot have grid placement: {widget_id}")


def _infer_next_grid_slot(placements: Mapping[str, Dict[str, int]]) -> Dict[str, int]:
    if not placements:
        return {"x": 0, "y": 0, "w": _DEFAULT_GRID_COLUMNS, "h": _DEFAULT_GRID_HEIGHT}
    bottom = max(slot["y"] + slot["h"] for slot in placements.values())
    return {"x": 0, "y": bottom, "w": _DEFAULT_GRID_COLUMNS, "h": _DEFAULT_GRID_HEIGHT}


def get_dashboard_spec(spec_id: str) -> ChartSpec:
    spec = DASHBOARD_SPEC_CATALOGUE.get(spec_id)
    if spec is None:
        raise KeyError(f"Unknown dashboard spec: {spec_id}")
    return deepcopy(spec)


def get_dashboard_manifest(org_id: str, dashboard_id: str = "dashboard-default") -> Manifest:
    manifest = _load_manifest(org_id, dashboard_id)
    return _clone_for_response(manifest, org_id)


def pin_widget_to_manifest(
    *,
    org_id: str,
    widget: Widget,
    dashboard_id: str = "dashboard-default",
    position: str = "end",
    target_band: Optional[str] = None,
) -> Manifest:
    manifest = _load_manifest(org_id, dashboard_id)
    _ensure_layout_scaffolding(manifest)

    widget_copy = deepcopy(widget)
    widget_copy.setdefault("locked", False)
    _validate_widget(widget_copy)

    existing_ids = {existing.get("id") for existing in manifest.get("widgets", [])}
    widget_id = widget_copy["id"]
    if widget_id in existing_ids:
        # Idempotent: return without mutating state.
        return get_dashboard_manifest(org_id, dashboard_id)

    widgets = manifest.setdefault("widgets", [])
    if position == "start":
        widgets.insert(0, widget_copy)
    else:
        widgets.append(widget_copy)

    layout = manifest["layout"]
    band_target = target_band or ("kpiBand" if widget_copy.get("kind") == "kpi" else "grid")

    if band_target == "kpiBand":
        if widget_copy.get("kind") != "kpi":
            raise ManifestValidationError("Only KPI widgets can be placed in the KPI band")
        band = layout.get("kpiBand", [])
        band = [wid for wid in band if wid != widget_id]
        if position == "start":
            band.insert(0, widget_id)
        else:
            band.append(widget_id)
        layout["kpiBand"] = band
    else:
        placements = layout.get("grid", {}).get("placements", {})
        placement = widget_copy.get("layout", {}).get("grid") if widget_copy.get("layout") else None
        if placement is None:
            placement = _infer_next_grid_slot(placements)
        placements[widget_id] = {
            "x": int(placement.get("x", 0)),
            "y": int(placement.get("y", 0)),
            "w": int(placement.get("w", _DEFAULT_GRID_COLUMNS)),
            "h": int(placement.get("h", _DEFAULT_GRID_HEIGHT)),
        }

    _validate_manifest(manifest)
    _save_manifest(org_id, dashboard_id, manifest)
    return get_dashboard_manifest(org_id, dashboard_id)


def remove_widget_from_manifest(
    *,
    org_id: str,
    widget_id: str,
    dashboard_id: str = "dashboard-default",
) -> Manifest:
    manifest = _load_manifest(org_id, dashboard_id)
    _ensure_layout_scaffolding(manifest)

    widgets = manifest.get("widgets", [])
    target_widget = next((widget for widget in widgets if widget.get("id") == widget_id), None)
    if target_widget is None:
        # Idempotent removal of missing widgets.
        return get_dashboard_manifest(org_id, dashboard_id)
    if target_widget.get("locked"):
        raise ManifestValidationError(f"Widget is locked and cannot be removed: {widget_id}")

    manifest["widgets"] = [widget for widget in widgets if widget.get("id") != widget_id]

    layout = manifest["layout"]
    layout["kpiBand"] = [wid for wid in layout.get("kpiBand", []) if wid != widget_id]
    placements = layout.get("grid", {}).get("placements", {})
    if widget_id in placements:
        placements.pop(widget_id)

    _validate_manifest(manifest)
    _save_manifest(org_id, dashboard_id, manifest)
    return get_dashboard_manifest(org_id, dashboard_id)


def list_dashboard_specs() -> Dict[str, ChartSpec]:
    return {key: get_dashboard_spec(key) for key in DASHBOARD_SPEC_CATALOGUE.keys()}


def list_manifests() -> Dict[str, Manifest]:
    return MANIFEST_REPOSITORY.list()
