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
- All seven VRM KPIs share a fixed 24h window with 15-minute buckets (96 points). Headlines use the latest 15-minute bucket; VRM Dwell carries forward the most recent non-null bucket when the final bucket is null.
- Footfall = entrances + exits per bucket; the headline is the most recent slice, not a 24h total.
- Traffic Distribution uses the last bucket per-camera counts to compute shares; when the last bucket total is zero the pie still renders zero-value slices. Capacity Usage derives `(latest occupancy ÷ capacity) × 100` from the VRM occupancy series.

## KPI tile rendering behavior
- `KpiTile` displays the primary series label as the card title for legacy dashboards. In VRM compact mode the label and unit chip are suppressed, the main value uses `meta.summary.headlineValue` (last bucket), deltas are hidden except Occupancy, and dwell KPIs render as whole minutes (e.g., `24 min`). Sparklines use the series values unless a traffic pie is rendered, and VRM sparkline tooltips show time-of-day only in the site timezone (no date, no “events” wording).
- Colors default to the series color or `#2d6cdf`; sparklines are `AreaChart` (Recharts) without animation.

## Live KPI widgets (VRM override)
`applyVRMOverrides` replaces any legacy KPI band in the manifest with a locked seven-tile VRM band. Titles come from `widget.title`; the unit label comes from the series unit via `KpiTile`.

| Widget ID | Display title | Measure | Notes |
| --- | --- | --- | --- |
| `kpi-vrm-entrances` | Entrances | `count` (`eventTypes: [1]`) | Headline = latest 15-minute bucket. Top-right delta chip hidden. |
| `kpi-vrm-occupancy` | Occupancy | `occupancy_recursion` | Headline = latest occupancy bucket; top-right delta chip shows Δ vs previous 15-minute bucket. Inline delta text is removed. |
| `kpi-vrm-exits` | Exits | `count` (`eventTypes: [0]`) | Headline = latest 15-minute bucket. Delta chip hidden. |
| `kpi-vrm-footfall` | Footfall | `count` (`eventTypes: [0, 1]`) | Headline = entrances + exits in latest bucket. Top-right chip: `today: <midnight→now total>`. No tertiary/24h total text. Delta chip hidden. |
| `kpi-vrm-dwell` | Dwell Time | `dwell_mean` | Headline = latest non-null bucket (falls back to prior bucket if the last bucket is null), whole minutes. Delta chip hidden. |
| `kpi-vrm-traffic` | Traffic by Camera | `count` grouped by camera | Headline = top camera share from last bucket. UI renders a per-camera share pie with slice annotations (no bottom legend); when the last bucket total is 0 it still renders 0% slices. |
| `kpi-vrm-capacity` | Capacity Usage | `occupancy_recursion` | Headline = `(latest occupancy ÷ capacity) × 100` rendered as a donut (segments: current usage, peak add-on, remainder) starting at 12 o'clock. Top-right chip: `peak: <percent>` from midnight→now. Capacity map: `client1 → 5`, `client2 → 750`, no fallback. Delta chip hidden. |

## VRM KPI band semantics
- All tiles: 24h/15m series; headlines use the final bucket except VRM Dwell, which carries forward the last non-null bucket when the final bucket is null.
- Delta chips remain only for Occupancy; Entrances, Exits, Dwell, Traffic by Camera, and Capacity Usage suppress the top-right delta. Footfall shows a summary chip (`today: <total>`) and Capacity Usage shows (`peak: <percent>`), but neither is a delta.
- Secondary/tertiary text: Footfall no longer surfaces a 24h total; Capacity Usage moves peak into the chip; Traffic by Camera uses slice annotations only.
- Traffic by Camera uses per-camera event counts to compute slice shares for the latest bucket and renders a pie with per-slice labels (no bottom legend); when the latest bucket total is zero the pie still renders zero-value slices and 0% tooltips.
- Capacity Usage uses the UI client/org identifier for capacity lookup (`client1 → 5`, `client2 → 750`), applying the same capacity for headline and peak-today calculations with no fallback. The donut starts at 12 o'clock with contiguous segments in order: current usage, peak add-on, remainder; each segment is annotated on-chart (no legend).

## VRM debugging helpers
- Passing `?vrmDebug=1` in non-production renders a debug panel beneath the KPI band. The panel lists each VRM widget with its series values, last bucket, calculated headline override, and any summary totals so you can verify the runtime headline is derived from the final bucket.
- `vrmDecorators.ts` also logs a lightweight console preview in development for the same values when KPI results are decorated.
