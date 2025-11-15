# Analytics Development Plan

## Phase 7 status

- `/analytics` runs against live BigQuery by default; the fixture transport is only available when `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` is set for development or Storybook scenarios.
- Inspector overrides (time ranges, splits, measure toggles) rebuild the underlying ChartSpec, produce a new spec hash, and trigger a fresh `/analytics/run` request for every curated preset.
- `/dashboard` consumes the manifest endpoints, honours pins originating from the analytics workspace, and reflects updates after a refresh.

## Transport toggles

| Mode | Required vars | Notes |
| --- | --- | --- |
| **Live (default)** | none (optional `REACT_APP_API_URL` for non-proxied dev) | Hits `/analytics/run` and enables inspector overrides. |
| **Fixtures (dev only)** | `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` | Locks overrides, shows the fixture warning banner, and replays curated JSON responses. |

## Manual QA checklist

1. Load `/analytics` and confirm the inspector badge shows **Live /analytics/run** with controls enabled.
2. For each preset:
   - **Live Flow** – switch between 6h, 24h, and 7d and verify the bucket size/x-axis span changes and the chart reruns.
   - **Average Dwell by Camera** – toggle 7d vs 30d and confirm dwell values change while remaining in minutes.
   - **Retention Heatmap** – toggle 12w vs 24w and ensure the cohort grid expands/contracts without validation warnings.
3. Pin a preset to the dashboard, refresh `/dashboard`, and confirm the new widget appears alongside the default manifest.
4. (Optional) Switch to fixtures via `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` to validate that controls visibly lock and the warning copy appears.
