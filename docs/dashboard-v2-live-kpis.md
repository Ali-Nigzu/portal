# Dashboard v2 KPI Reference

## Routing and surface
- The React app (CRA) routes `/dashboard` through `App.tsx`, wrapping content in `VRMLayout` and choosing `DashboardV2Page` by default via `EXPERIENCE_GATES.dashboard.default` (defaults to `v2` in non-production). Legacy `DashboardPage` exists but is not rendered unless the flag is flipped.
- `DashboardV2Page` is the live manifest-driven dashboard. It loads a dashboard manifest (default ID `dashboard-default`) and renders KPI tiles from `manifest.layout.kpiBand`. Other dashboards are legacy/unused unless explicitly routed.

## Data flow
- Manifests are fetched from `/api/dashboards/{dashboardId}` with `orgId` or `viewToken` query params. If loading fails, the page shows an error banner and stops rendering.
- Each widget is executed by POSTing `/api/analytics/run` with a built `chart spec` (either inline or referenced). Specs can be run live or via fixtures depending on `ANALYTICS_V2_TRANSPORT` and widget `fixtureId`.
- `buildWidgetSpec` clones the inline spec and optionally overrides `timeWindow` and timestamp dimension bucket using the selected manifest time range (duration/backfill from `now`, optional `timezone`).
- Widget results are validated, then displayed through `ChartRenderer`, which renders KPI tiles for `single_value` chart types.

## Time controls
- `DashboardV2Page` pulls time range options from `manifest.timeControls.options` and sets `selectedTimeRangeId` to the manifest default (e.g., `all_time`) or the first option. Changing the dropdown triggers a full widget reload with the new time window applied through `buildWidgetSpec`.
- When a time range is applied, `from` = `now - durationMinutes` (or epoch if `allTime`), `to` = `now`, and the bucket is set to the option’s `bucket`. Without a selection, inline `timeWindow` values remain (e.g., `{{TODAY_START}}` → now for “today” KPIs). All timestamps are treated as UTC unless the manifest supplies a different timezone.

## KPI tile rendering behavior
- `KpiTile` (analytics ChartRenderer primitive) displays the primary series label as the card title, main value from the latest data point, optional unit, raw count, coverage badge (from `coverage` on the latest point), delta badge (from `series.summary.delta`), and a sparkline built from series data values. No per-card spinners exist; the entire dashboard shows loading/error banners while data is fetched.
- Colors default to the series color or `#2d6cdf`; sparklines are `AreaChart` (Recharts) without animation.

## Live KPI widgets in the default manifest
The default manifest (`dashboard_manifest_default.json`) defines six KPI widgets in the KPI band. Titles in the UI come from `widget.title`, while the card label comes from the series label.

| Widget ID | Display title | Measure | Time window (inline before overrides) | Notes |
| --- | --- | --- | --- | --- |
| `kpi-activity-today` | Activity Today/Total | `count` of all events (`activity_total`) | `{{TODAY_START}}` → `{{NOW}}`, bucket `HOUR`, timezone `UTC` | Counts entrances + exits since local midnight. |
| `kpi-entrances-today` | Entrances Today | `count` with `eventTypes: [1]` (`entrances`) | `{{TODAY_START}}` → `{{NOW}}`, bucket `HOUR`, timezone `UTC` | Entrances since local midnight. |
| `kpi-exits-today` | Exits Today | `count` with `eventTypes: [0]` (`exits`) | `{{TODAY_START}}` → `{{NOW}}`, bucket `HOUR`, timezone `UTC` | Exits since local midnight. |
| `kpi-live-occupancy` | Live Occupancy | `occupancy_recursion` (`live_occupancy`) | `{{NOW_MINUS_60_MIN}}` → `{{NOW}}`, bucket `5_MIN`, timezone `UTC` | Uses recursive occupancy aggregation over 5-minute buckets; mirrors last point in live flow. |
| `kpi-avg-dwell` | Avg Dwell | `dwell_mean` (`avg_dwell`) | `{{TODAY_START}}` → `{{NOW}}`, bucket `HOUR`, timezone `UTC` | Average dwell duration today (minutes). |
| `kpi-freshness` | Freshness Status | `count` with `options.metric: freshness` (`freshness_minutes`) | `{{NOW_MINUS_120_MIN}}` → `{{NOW}}`, bucket `5_MIN`, timezone `UTC` | Expects backend to emit freshness minutes; coverage/carry-forward on latest point. |

## Update cadence and errors
- Dashboard loads manifest on mount and when “Reload manifest” is clicked. Widgets reload on manifest load, time-range changes, or “Refresh data.” No background polling is implemented.
- If some widgets fail, the page shows an error banner (“Some widgets failed to load”) and renders per-widget error states. Loading state applies to the whole dashboard via `aria-busy` and placeholders.

## Layout/styling
- KPI band rendered as a horizontal list within `.dashboard-v2__kpi-band`; each tile uses `.dashboard-v2__kpi-tile` with head/title and embedded `KpiTile` markup. The main layout uses CSS grid for charts (`gridTemplateColumns` from manifest columns, row height 96px). Styles live in `dashboard/v2/styles/DashboardV2Page.css`.
