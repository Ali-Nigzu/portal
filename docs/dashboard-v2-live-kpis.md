# Dashboard v2 KPI Reference

## Routing and surface
- The React app (CRA) routes `/dashboard` through `App.tsx`, wrapping content in `VRMLayout` and choosing `DashboardV2Page` by default via `EXPERIENCE_GATES.dashboard.default` (defaults to `v2` in non-production). Legacy `DashboardPage` exists but is not rendered unless the flag is flipped.
- `DashboardV2Page` is the live manifest-driven dashboard. It loads a dashboard manifest (default ID `dashboard-default`), applies `applyVRMOverrides`, and renders KPI tiles from `manifest.layout.kpiBand`. The VRM overrides replace any legacy KPI band with the current seven-tile VRM set.

## Layout and header
- The VRM KPI band renders a single layer of dark gradient tiles (no outer white card wrappers). Titles appear once per tile inside the gradient card.
- The header shows `Site – Site ID`, `Last updated: Realtime`, `Status: OK`, and the local time label. Time-range, refresh, reload, and Site ID controls are hidden when the manifest renders the VRM KPI set; non-VRM dashboards still show them.

## Data flow
- Manifests are fetched from `/api/dashboards/{dashboardId}` with `orgId` or `viewToken` query params. If loading fails, the page shows an error banner and stops rendering.
- Each widget is executed by POSTing `/api/analytics/run` with a built chart spec (inline or referenced). Specs can be run live or via fixtures depending on `ANALYTICS_V2_TRANSPORT` and widget `fixtureId`.
- `buildWidgetSpec` clones the inline spec and applies `fixedTimeWindow` for VRM KPIs (24h window, 15-minute buckets). Other widgets may still be driven by `manifest.timeControls` selections.
- Widget results are validated, then displayed through `ChartRenderer`, which renders KPI tiles for `single_value` chart types.

## Time semantics (VRM KPI band)
- All seven VRM KPIs share a fixed 24h window with 15-minute buckets (96 points). The headline number for every tile is **always the latest 15-minute bucket**; sparklines and totals use the full 24-hour series.
- Footfall = entrances + exits per bucket; the headline is the most recent slice, not a 24h total.
- Traffic Distribution uses the last bucket per-camera counts to compute shares; Capacity Usage derives `(latest occupancy ÷ capacity) × 100`.

## KPI tile rendering behavior
- `KpiTile` displays the primary series label as the card title for legacy dashboards. In VRM compact mode the label and unit chip are suppressed, the main value uses `meta.summary.headlineValue` (last bucket), deltas are hidden except Occupancy, and dwell KPIs render as whole minutes (e.g., `24 min`). Sparklines use the series values unless a traffic pie is rendered.
- Colors default to the series color or `#2d6cdf`; sparklines are `AreaChart` (Recharts) without animation.

## Live KPI widgets (VRM override)
`applyVRMOverrides` replaces any legacy KPI band in the manifest with a locked seven-tile VRM band. Titles come from `widget.title`; the unit label comes from the series unit via `KpiTile`.

| Widget ID | Display title | Measure | Notes |
| --- | --- | --- | --- |
| `kpi-vrm-entrances` | Entrances | `count` (`eventTypes: [1]`) | Headline = latest 15-minute bucket. Top-right delta chip hidden. |
| `kpi-vrm-occupancy` | Occupancy | `occupancy_recursion` | Headline = latest occupancy bucket; top-right delta chip shows Δ vs previous 15-minute bucket. Inline delta text is removed. |
| `kpi-vrm-exits` | Exits | `count` (`eventTypes: [0]`) | Headline = latest 15-minute bucket. Delta chip hidden. |
| `kpi-vrm-footfall` | Footfall | `count` (`eventTypes: [0, 1]`) | Headline = entrances + exits in latest bucket. Secondary text: “Today’s footfall: <midnight→now total>”; tertiary text keeps `24h total: …`. Delta chip hidden. |
| `kpi-vrm-dwell` | Dwell Time | `dwell_mean` | Headline = latest bucket average dwell time (whole minutes). Delta chip hidden. |
| `kpi-vrm-traffic` | Traffic Distribution | `count` grouped by camera | Headline = top camera share from last bucket. UI renders a per-camera share pie and legend; no 100% placeholder/progress bar. |
| `kpi-vrm-capacity` | Capacity Usage | `occupancy_recursion` | Headline = `(latest occupancy ÷ capacity) × 100`; secondary text “Peak today: <percent>”. Capacity map: `client1 → 10`, `client2 → 100`, fallback 10. Delta chip hidden. |

## VRM KPI band semantics
- All tiles: 24h/15m series; headlines always use the final bucket (last 15 minutes).
- Delta chips remain only for Occupancy; Entrances, Exits, Dwell, Footfall, Traffic Distribution, and Capacity Usage suppress the top-right delta.
- Secondary/tertiary text: Footfall surfaces “Today’s footfall” plus a tertiary 24h total; Capacity Usage shows “Peak today” from midnight→now; Traffic Distribution carries legend metadata.
- Traffic Distribution uses per-camera event counts to compute slice shares for the latest bucket and renders a pie + legend.
- Capacity Usage uses the UI client/org identifier for capacity lookup (`client1 → 10`, `client2 → 100`), applying the same capacity for headline and peak-today calculations.

## VRM debugging helpers
- Passing `?vrmDebug=1` in non-production renders a debug panel beneath the KPI band. The panel lists each VRM widget with its series values, last bucket, calculated headline override, and any summary totals so you can verify the runtime headline is derived from the final bucket.
- `vrmDecorators.ts` also logs a lightweight console preview in development for the same values when KPI results are decorated.
