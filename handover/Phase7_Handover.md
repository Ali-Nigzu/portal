# Phase 7 – Manifest + fixture baseline

## Summary

- `/analytics` shipped with fixture transport enabled by default so product/design could exercise presets without relying on live data. Live mode remained opt-in via `REACT_APP_ANALYTICS_V2_TRANSPORT=live`.
- Inspector controls (time ranges, splits, measure toggles) were wired but intentionally locked in fixture mode to avoid implying live reactivity before the backend endpoint existed.
- `/dashboard` continued to read the manifest API, honour pin/unpin requests from the workspace, and reflect updates after a refresh while still rendering curated fixture responses.

## Environment matrix

| Scenario | Environment variables | Behaviour |
| --- | --- | --- |
| Production / Docker (default) | `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` (implicit) | Fixture transport with inspector controls locked and helper messaging. |
| Local dev with API proxy | `REACT_APP_API_URL=http://localhost:8000` | Fixtures by default; set `REACT_APP_ANALYTICS_V2_TRANSPORT=live` when ready to exercise `/api/analytics/run`. |
| Fixture demos / Storybook | `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` | Uses curated JSON fixtures; inspector overrides stay locked with helper copy. |

## Manual QA checklist

1. Visit `/analytics` and confirm the inspector badge shows the fixture warning copy (controls locked).
2. Pin any preset to the dashboard, refresh `/dashboard`, and confirm the pinned widget appears using the manifest fixture payloads.
3. (Optional) Toggle `REACT_APP_ANALYTICS_V2_TRANSPORT=live` only when `/api/analytics/run` is available; once Phase 9 lands the live checklist supersedes this document.
