# VRM-style KPI band (current state)

## Live dashboard identification
- **Route and surface:** `/dashboard` renders inside `VRMLayout`; the default experience gate points to `DashboardV2Page`, falling back to the legacy page only if the gate flips.
- **Manifest-driven layout:** `DashboardV2Page` loads `dashboard-default` from `/api/dashboards/{id}` and renders KPI tiles from `manifest.layout.kpiBand` using `KpiTile` + `ChartRenderer`. `applyVRMOverrides` injects the seven VRM tiles and removes legacy KPI entries.
- **Header controls:** The header shows `Site – Site ID`, `Last updated: Realtime`, `Status: OK`, and local time. Time-range, refresh, reload, and Site ID controls are hidden when the manifest renders the VRM KPI set; non-VRM dashboards still surface them.

## VRM KPI set and semantics
- All VRM tiles use a fixed 24h window with 15-minute buckets (96 points). Headlines use the final bucket; VRM Dwell carries forward the most recent non-null bucket when the final bucket is null. Sparklines use the full series.
- Layout is a single dark gradient tile per KPI (no outer white card). Titles appear once inside the tile.
- Delta chips are suppressed for Entrances, Exits, Dwell, Footfall, Traffic Distribution, and Capacity Usage. Occupancy retains the top-right delta vs the previous bucket, but inline delta copy is removed.

| Widget ID | Measure | Headline | Secondary/Tertiary |
| --- | --- | --- | --- |
| `kpi-vrm-entrances` | `count` (`eventTypes: [1]`) | Entrances in last 15 minutes. | None. |
| `kpi-vrm-occupancy` | `occupancy_recursion` | Latest occupancy bucket; delta chip shows Δ vs previous 15-minute bucket. | None. |
| `kpi-vrm-exits` | `count` (`eventTypes: [0]`) | Exits in last 15 minutes. | None. |
| `kpi-vrm-footfall` | `count` (`eventTypes: [0, 1]`) | Entrances + exits in last 15 minutes. | Chip (top-right): `today: <midnight→now total>`. No tertiary/24h total. |
| `kpi-vrm-dwell` | `dwell_mean` | Latest non-null dwell bucket (falls back when the last bucket is null), whole minutes. | None. |
| `kpi-vrm-traffic` | `count` grouped by camera | Top camera share (last bucket). | Per-camera pie with slice annotations (no bottom legend); when the last bucket total is 0 it still renders zero-value slices and 0% tooltips. |
| `kpi-vrm-capacity` | `occupancy_recursion` | `(latest occupancy ÷ capacity) × 100` rendered as a donut (segments: current usage, peak add-on, remainder) starting at 12 o'clock. | Chip (top-right): `peak: X%` from midnight→now; capacity map uses UI client (`client1 → 5`, `client2 → 750`), no fallback. |

## Capacity usage rules
- Capacity lookup uses the UI org/client identifier, not the BigQuery table name. Mapping: `client1 → 5`, `client2 → 750` (no fallback; unknown clients error).
- Both the headline and “Peak today” calculation apply the same capacity. The occupancy series is normalized to a percentage series for the full 24h/15m window; the capacity donut renders three contiguous segments in order (current usage, peak add-on, remainder) starting at 12 o'clock with on-arc labels.

## Traffic distribution rules
- Traffic Distribution uses per-camera event counts in the last bucket to compute shares: `share(cam) = events(cam) / total(last bucket) * 100`. When the last bucket total is 0, the pie still renders zero-value slices (one per configured camera) with 0% tooltips and center headline 0.
- The widget renders a pie for the latest bucket with per-slice annotations (no legend). When only one camera exists, the pie shows a single slice; multiple cameras divide the pie accordingly.

## Debugging
- Passing `?vrmDebug=1` in non-production renders a debug panel beneath the KPI band with per-tile series values, last-bucket headlines, and summary text. `vrmDecorators.ts` also logs a console preview of the same calculations in development.
