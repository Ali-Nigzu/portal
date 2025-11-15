# Analytics Development Plan

## Phase 7 status

- Analytics workspace and dashboard V2 shipped with fixture-first plumbing so QA could rely on deterministic curated results.
- Manifest APIs (`GET/POST/DELETE /api/dashboards/...`) became the single source for `/dashboard`, enabling pin/unpin flows from the workspace.
- Live transport remained behind the `REACT_APP_ANALYTICS_V2_TRANSPORT=live` development flag while the BigQuery pipeline was hardened.

## Phase 9 status

- `/analytics` now defaults to the live BigQuery transport; set `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` to opt into fixture mode for Storybook/dev demos.
- Inspector overrides (time ranges, splits, measure toggles) rebuild the underlying ChartSpec, produce a new spec hash, and trigger a fresh `/api/analytics/run` request for every curated preset.
- `/dashboard` widgets call the same `/api/analytics/run` endpoint (with `/analytics/run` alias for backwards compatibility), so KPI tiles and charts reflect the selected time range/site and update after pins or refreshes.

## Transport toggles

| Mode | Required vars | Notes |
| --- | --- | --- |
| **Live (default)** | none (optional `REACT_APP_API_URL` for non-proxied dev) | Hits `/api/analytics/run` and enables inspector overrides. |
| **Fixtures (dev only)** | `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` | Locks overrides, shows the fixture warning banner, and replays curated JSON responses. |

## Manual QA checklist

1. Load `/analytics` and confirm the inspector badge shows **Live /api/analytics/run** with controls enabled.
2. For each preset:
   - **Live Flow** – switch between 6h, 24h, and 7d and verify the bucket size/x-axis span changes and the chart reruns.
   - **Average Dwell by Camera** – toggle 7d vs 30d and confirm dwell values change while remaining in minutes.
   - **Retention Heatmap** – toggle 12w vs 24w and ensure the cohort grid expands/contracts without validation warnings.
3. Pin a preset to the dashboard, refresh `/dashboard`, and confirm the new widget appears alongside the default manifest.
4. (Optional) Switch to fixtures via `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` to validate that controls visibly lock and the warning copy appears.
