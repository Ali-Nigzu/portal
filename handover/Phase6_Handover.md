# Phase 6 Handover Notes

## Milestone 1 – Launch Governance Without Legacy Fallback

**Status:** ✅ complete

### What changed
- Routing governance now lives in `frontend/src/config.ts`, exporting `EXPERIENCE_GATES` for analytics and dashboard surfaces.
- `/analytics` and `/dashboard` resolve their active experience based on explicit environment configuration; legacy and v2 suffix routes are only available when explicitly exposed in non-production builds.
- Production builds force Analytics Workspace V2 and Dashboard V2 and suppress all legacy routes.
- `docs/analytics/phase6_rollout.md` documents the flag matrix, default combinations, and smoke checks for flipping between behaviours during development.
- Jest coverage added (`frontend/src/__tests__/experienceConfig.test.ts`) to lock routing behaviour and production hardening in place.

### Still outstanding for Phase 6
- None. All downstream milestones (workspace promotion, dashboard promotion, manifest hardening, QA expansion, and guardrails) are complete in this phase. Any future work focuses on Phase 7 durability/telemetry upgrades.

### How to validate quickly
1. `npm --prefix frontend start` – launch the dev server.
2. Edit `.env.development.local` with combinations from `docs/analytics/phase6_rollout.md`.
3. Refresh the app and verify `/analytics` and `/dashboard` honour the configured defaults; suffix routes should exist only when explicitly enabled.
4. Run `CI=true npm --prefix frontend test -- experienceConfig` to ensure gating logic has not regressed.

### Emergency levers (non-production only)
- `REACT_APP_ANALYTICS_EXPERIENCE` / `REACT_APP_DASHBOARD_EXPERIENCE` to flip the default page.
- `REACT_APP_EXPOSE_ANALYTICS_LEGACY` / `REACT_APP_EXPOSE_DASHBOARD_LEGACY` to surface legacy routes temporarily for QA.
- The legacy experiences are never reachable in production builds.

## Milestone 2 – Analytics Workspace Promotion & Polish

**Status:** ✅ complete

### What changed
- `/analytics` now mounts the V2 workspace by default in all environments; legacy analytics is hidden behind `/analytics/legacy` and only exposed when `REACT_APP_EXPOSE_ANALYTICS_LEGACY=true` in non-production builds.
- Navigation links (`VRMLayout`) route to the new workspace, ensuring there is no accidental path back to legacy analytics for standard users.
- Experience gating defaults updated in `frontend/src/config.ts` so development/staging builds require no overrides to reach the V2 workspace. QA toggles remain for legacy suffix access.
- Documentation in `docs/analytics/phase6_rollout.md` expanded with default/QA/emergency configurations and smoke instructions.

### Validation steps
1. `npm --prefix frontend start` and authenticate.
2. Visit `/analytics` — a default preset should auto-load via the workspace transport; inspector controls, badges, and ChartRenderer states should match Phase 4 specifications.
3. Trigger an error by toggling network offline in devtools; confirm shared loading/error components surface correctly.
4. Optional QA: set `REACT_APP_EXPOSE_ANALYTICS_LEGACY=true`, restart, and confirm `/analytics/legacy` is reachable while `/analytics` remains on the V2 workspace.

### Notes
- Pinning from the workspace continues to call the manifest pin API (`frontend/src/dashboard/v2/transport/mutateDashboardManifest.ts`) and the dashboard reflects changes immediately.
- No ChartSpec/ChartResult schema changes and no frontend metric recomputation.

## Milestone 3 – Dashboard V2 Promotion & Stability

**Status:** ✅ complete

### What changed
- `/dashboard` now mounts Dashboard V2 in every environment by default; legacy dashboard access is limited to `/dashboard/legacy` when `REACT_APP_EXPOSE_DASHBOARD_LEGACY=true` in non-production builds.
- Updated experience gating in `frontend/src/config.ts` so development/staging builds default to V2 without manual overrides; production still hard-forces V2 and suppresses legacy routes.
- Dashboard header copy updated to remove preview messaging and reflect the live manifest-driven experience.
- Added transport-level Jest coverage (`frontend/src/dashboard/v2/transport/fetchDashboardManifest.test.ts` and `mutateDashboardManifest.test.ts`) to lock manifest fetch/pin/unpin behaviour.
- Expanded gating tests (`frontend/src/__tests__/experienceConfig.test.ts`) to assert dashboard defaults, QA overrides, and forced-legacy comparison flows.

### Validation steps
1. `npm --prefix frontend start`, sign in, and open `/dashboard`. Confirm KPI band values and Live Flow render via ChartRenderer using fixtures/live transport per config.
2. Pin a chart from `/analytics`; the new widget should appear on the dashboard without refreshing.
3. Change the dashboard time range selector to ensure widgets rerun with updated `LoadWidgetOptions` (verified via golden fixtures in tests).
4. Optional QA: set `REACT_APP_EXPOSE_DASHBOARD_LEGACY=true`, restart, and manually open `/dashboard/legacy` to compare outputs. The main navigation should remain pointed at `/dashboard`.

### Notes
- Legacy dashboard is removed from navigation and cannot serve as a production fallback; incidents must stabilise Dashboard V2 directly.
- Transport tests assert error propagation for manifest fetch/pin/unpin calls, matching Milestone 3 stability requirements.

## Milestone 4 – Manifest Hardening

**Status:** ✅ complete

### What changed
- `backend/app/analytics/dashboard_catalogue.py` now validates manifest payloads (widget schema, layout grid bounds, KPI band integrity) and wraps persistence in `ManifestRepository` for future durable storage.
- Pin/unpin routes are idempotent; duplicate pins return the existing manifest and unpinning a missing widget is a no-op.
- FastAPI endpoints emit structured errors (`manifest_not_found`, `manifest_validation`) and never corrupt the in-memory manifest on failure.
- Backend tests expanded (`backend/tests/test_dashboard_manifest.py`) to cover validation failures, rollback behaviour, and idempotency.

### Validation steps
1. `pytest backend/tests/test_dashboard_manifest.py` – should pass cleanly.
2. Manual curl against `/api/dashboards/dashboard-default/widgets` with malformed payload -> 400 + structured error without state mutation.
3. Duplicate pin -> manifest unchanged; removing locked widgets -> 400 validation error.

### Notes
- Repository abstraction allows swapping in database/file persistence in Phase 7 without touching routing/business logic.
- Durable storage + migration tooling are intentionally deferred.

## Milestone 5 – QA Matrix & Deterministic Verification

**Status:** ✅ complete

### What changed
- Added analytics workspace integration tests (`frontend/src/analytics/v2/pages/AnalyticsV2Page.test.tsx`) covering preset runs, inspector interactions, pinning, and error surfaces.
- Dashboard transport/page tests updated to assert abort signals, manifest fetch retries, widget error propagation, and reload flows.
- `docs/analytics/phase6_rollout.md` now carries the full QA matrix (analytics, dashboard, manifest API), logging namespaces, and smoke scripts.

### Validation steps
1. `CI=true npm --prefix frontend test` – ensure analytics/dashboard suites and transport tests run end-to-end.
2. Follow QA matrix in `docs/analytics/phase6_rollout.md` to confirm manual pinning, reruns, and error states.
3. Use fixtures vs live transport toggle to verify deterministic rendering and inspector behaviour.

### Notes
- QA doc lists required console namespaces to monitor (`[analytics:v2]`, `[dashboard.manifest]`, `[dashboard.widgets]`).
- Deterministic validation leverages existing golden fixtures; no schema changes were required.
- Latest TypeScript mock corrections mirror the concrete transport error classes so production builds remain type-safe without altering backend contracts.

## Milestone 6 – Production Guardrails & Observability

**Status:** ✅ complete

### What changed
- Shared `ErrorBoundary` component (`frontend/src/common/components/ErrorBoundary.tsx`) wraps analytics and dashboard pages, logging to `[ui.analytics-workspace]` / `[ui.dashboard-v2]` and presenting user-friendly fallbacks.
- `createAbortSignal` + logging utilities (`frontend/src/common/utils/abort.ts`, `frontend/src/common/utils/logger.ts`) enforce timeouts and structured console output across manifest fetch, pin/unpin, and widget loaders.
- Dashboard + analytics transports emit start/success/error logs; widget loaders capture validation failures and batch errors without crashing the shell.

### Validation steps
1. Simulate slow/failed network requests (devtools throttling) – confirm aborts trigger retry logs and UI fallbacks.
2. Force component exceptions (e.g., temporary throwing within dev build) – error boundary renders fallback and logs incident.
3. Inspect console logs during pin/unpin and manifest refresh for `[dashboard.manifest]` events.

### Notes
- Guardrails operate entirely client-side; they do not reintroduce legacy fallbacks. Incidents should use widget-level circuit breakers, not route switches.
- Logging currently targets the browser console; hook into a central telemetry sink in Phase 7 if required.
