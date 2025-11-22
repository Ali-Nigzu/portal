# Dashboard v2 KPI Reference

## Routing and surface
- The React app (CRA) routes `/dashboard` through `App.tsx`, wrapping content in `VRMLayout` and choosing `DashboardV2Page` by default via `EXPERIENCE_GATES.dashboard.default` (defaults to `v2` in non-production). Legacy `DashboardPage` exists but is not rendered unless the flag is flipped.
- `DashboardV2Page` is the live manifest-driven dashboard. It loads a dashboard manifest (default ID `dashboard-default`), applies `applyVRMOverrides`, and renders KPI tiles from `manifest.layout.kpiBand`. Other dashboards are legacy/unused unless explicitly routed.

## Data flow
- Manifests are fetched from `/api/dashboards/{dashboardId}` with `orgId` or `viewToken` query params. If loading fails, the page shows an error banner and stops rendering.
- Each widget is executed by POSTing `/api/analytics/run` with a built chart spec (inline or referenced). Specs can be run live or via fixtures depending on `ANALYTICS_V2_TRANSPORT` and widget `fixtureId`.
- `buildWidgetSpec` clones the inline spec and optionally overrides `timeWindow` and timestamp dimension bucket using the selected manifest time range (duration/backfill from `now`, optional `timezone`).
- Widget results are validated, then displayed through `ChartRenderer`, which renders KPI tiles for `single_value` chart types.

## Time controls
- `DashboardV2Page` pulls time range options from `manifest.timeControls.options` and sets `selectedTimeRangeId` to the manifest default (e.g., `all_time`) or the first option. Changing the dropdown triggers a full widget reload with the new time window applied through `buildWidgetSpec`.
- When a time range is applied, `from` = `now - durationMinutes` (or epoch if `allTime`), `to` = `now`, and the bucket is set to the option’s `bucket`. Without a selection, inline `timeWindow` values remain (e.g., `{{TODAY_START}}` → now for “today” KPIs). All timestamps are treated as UTC unless the manifest supplies a different timezone.

## KPI tile rendering behavior
- `KpiTile` (analytics ChartRenderer primitive) displays the primary series label as the card title, main value from `meta.summary.headlineValue` when provided (VRM sets this from the last bucket), optional unit, and a sparkline built from series data values. Raw/coverage/delta rows are hidden in VRM compact mode.
- Colors default to the series color or `#2d6cdf`; sparklines are `AreaChart` (Recharts) without animation.

## Live KPI widgets (VRM override)
`applyVRMOverrides` replaces any legacy KPI band in the manifest with a locked seven-tile VRM band. Each widget uses a 24h window with 15-minute buckets, and the headline shown in the UI always comes from the final bucket in the series (last 15 minutes). Titles come from `widget.title`; the unit label comes from the series unit via `KpiTile`.

| Widget ID | Display title | Measure | Notes |
| --- | --- | --- | --- |
| `kpi-vrm-entrances` | Entrances | `count` (`eventTypes: [1]`) | Headline = latest 15-minute bucket, subtitle may show 24h totals. |
| `kpi-vrm-occupancy` | Occupancy | `occupancy_recursion` | Headline = latest occupancy bucket, subtitle shows Δ vs 15m ago. |
| `kpi-vrm-exits` | Exits | `count` (`eventTypes: [0]`) | Headline = latest 15-minute bucket. |
| `kpi-vrm-footfall` | Footfall | `count` (`eventTypes: [0, 1]`) | Headline = entrances + exits in latest bucket; subtitle shows 24h total. |
| `kpi-vrm-dwell` | Dwell Time | `dwell_mean` | Headline = latest bucket average dwell time. |
| `kpi-vrm-traffic` | Traffic Distribution | `count` grouped by camera | Frontend-only placeholder shows `100%` (single camera) but still treated as a last-15-minute share. |
| `kpi-vrm-capacity` | Capacity Usage | `occupancy_recursion` | Headline = `(latest occupancy ÷ capacity) × 100`; capacity map `client1 → 10`, `client2 → 100`, fallback 10. Subtitle shows peak today %. |

## VRM KPI band semantics
- All seven VRM KPIs share a fixed 24h/15m window. The headline number for every tile is **always the latest 15-minute bucket**; sparklines and totals use the full 24-hour series.
- Footfall = entrances + exits; the subtitle shows the 24h total while the headline is the most recent 15-minute bucket.
- Traffic Distribution remains frontend-only: one camera renders `100%` with the subtitle `Camera – 100% of events`, still interpreted as a last-15-minutes share.
- Capacity Usage reuses occupancy data; headline = `(latest occupancy ÷ capacity) × 100`, subtitle = `Peak today: <percent>`. Capacity map: `client1 → 10`, `client2 → 100` (fallback 10 with a console warning).

## VRM debugging helpers
- Passing `?vrmDebug=1` in non-production renders a debug panel beneath the KPI band. The panel lists each VRM widget with its series values, last bucket, calculated headline override, and any summary totals so you can verify the runtime headline is derived from the final bucket.
- `vrmDecorators.ts` also logs a lightweight console preview in development for the same values when KPI results are decorated.
