# VRM-style KPI band (current state)

## Live dashboard identification
- **Route and surface:** `/dashboard` renders inside `VRMLayout`; the default experience gate points to `DashboardV2Page`, falling back to the legacy page only if the gate flips.
- **Manifest-driven layout:** `DashboardV2Page` loads `dashboard-default` from `/api/dashboards/{id}` and renders KPI tiles from `manifest.layout.kpiBand` using `KpiTile` + `ChartRenderer`. `applyVRMOverrides` injects the seven VRM tiles and removes legacy KPI entries.
- **Header controls:** The header shows `Site – Site ID`, `Last updated: Realtime`, `Status: OK`, local time, an optional time-range dropdown, and Refresh/Reload buttons. VRM KPIs keep a fixed 24h/15m window regardless of the dropdown; other widgets may still honor manifest time ranges.

## VRM KPI set and semantics
- All VRM tiles use a fixed 24h window with 15-minute buckets (96 points). The headline for every tile is the final bucket (last 15 minutes). Sparklines use the full series.
- Layout is a single dark gradient tile per KPI (no outer white card). Titles appear once inside the tile.
- Delta chips are suppressed for Entrances, Exits, Dwell, Footfall, Traffic Distribution, and Capacity Usage. Occupancy retains the top-right delta vs the previous bucket, but inline delta copy is removed.

| Widget ID | Measure | Headline | Secondary/Tertiary |
| --- | --- | --- | --- |
| `kpi-vrm-entrances` | `count` (`eventTypes: [1]`) | Entrances in last 15 minutes. | None. |
| `kpi-vrm-occupancy` | `occupancy_recursion` | Latest occupancy bucket; delta chip shows Δ vs previous 15-minute bucket. | None. |
| `kpi-vrm-exits` | `count` (`eventTypes: [0]`) | Exits in last 15 minutes. | None. |
| `kpi-vrm-footfall` | `count` (`eventTypes: [0, 1]`) | Entrances + exits in last 15 minutes. | Secondary: “Today’s footfall: <midnight→now total>”; tertiary: `24h total: …`. |
| `kpi-vrm-dwell` | `dwell_mean` | Latest dwell bucket, whole minutes. | None. |
| `kpi-vrm-traffic` | `count` grouped by camera | Top camera share (last bucket). | Per-camera pie + legend; no 100% placeholder/progress bar. |
| `kpi-vrm-capacity` | `occupancy_recursion` | `(latest occupancy ÷ capacity) × 100`. | Secondary: “Peak today: X%” from midnight→now; capacity map uses UI client (`client1 → 10`, `client2 → 100`, fallback 10). |

## Capacity usage rules
- Capacity lookup uses the UI org/client identifier, not the BigQuery table name. Mapping: `client1 → 10`, `client2 → 100` (fallback 10 with a console warning).
- Both the headline and “Peak today” calculation apply the same capacity. The series is converted to a single last-bucket usage point for the headline while keeping the 24h sparkline shape.

## Traffic distribution rules
- Traffic Distribution uses per-camera event counts in the last bucket to compute shares: `share(cam) = events(cam) / total(last bucket) * 100`.
- The widget renders a pie + legend for the latest bucket. When only one camera exists, the pie shows a single 100% slice; multiple cameras divide the pie accordingly.

## Debugging
- Passing `?vrmDebug=1` in non-production renders a debug panel beneath the KPI band with per-tile series values, last-bucket headlines, and summary text. `vrmDecorators.ts` also logs a console preview of the same calculations in development.
