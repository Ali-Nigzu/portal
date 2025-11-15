# Phase 7 – Live analytics surfaces

## Summary

- `/analytics` now defaults to the live BigQuery transport; fixture mode is only available when `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` is set for dev/Storybook tooling.
- Inspector controls (time ranges, splits, measure toggles) mutate the preset ChartSpec, generate a new spec hash, and trigger `/analytics/run` across all curated presets (Live Flow, Average Dwell, Retention Heatmap).
- `/dashboard` continues to read the manifest API, honours pin/unpin requests from the workspace, and reflects updates after a refresh.

## Environment matrix

| Scenario | Environment variables | Behaviour |
| --- | --- | --- |
| Production / Docker (default) | none | Live `/analytics/run` transport with fully enabled inspector controls. |
| Local dev with API proxy | `REACT_APP_API_URL=http://localhost:8000` | Live transport against the FastAPI server. |
| Fixture demos / Storybook | `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` | Uses curated JSON fixtures, inspector overrides lock with helper copy. |

## Manual QA checklist

1. Visit `/analytics` and confirm the inspector badge shows **Live /analytics/run**.
2. For each preset:
   - Live Flow: switch between 6h / 24h / 7d and confirm the x-axis span, bucket size, and values change.
   - Average Dwell by Camera: switch between 7d / 30d and confirm dwell minutes adjust.
   - Retention Heatmap: switch between 12w / 24w and verify the cohort grid expands/contracts without validation errors.
3. Pin any preset to the dashboard, refresh `/dashboard`, and confirm the pinned widget appears.
4. (Optional) Set `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` to confirm inspector controls lock and the helper messaging is visible.
