# Phase 2 Handover

## Running the compiler
1. Ensure the virtual environment is active (`poetry shell` or equivalent) and dependencies installed (`poetry install`).
2. Prepare a valid `ChartSpec` JSON (see `shared/analytics/examples/golden_dashboard_live_flow.json` or `shared/analytics/examples/chartresult_phase2_example.json` for structure).
3. Run the compiler directly:
   ```bash
   python - <<'PY'
   from backend.app.analytics.compiler import SpecCompiler, CompilerContext
   from backend.app.analytics.router import TableRouter

   spec = {...}  # populate with the chart spec to compile
   context = CompilerContext(table_name=TableRouter({"client0": "nigzsu.dataset.client0"}).resolve("client0"))
   compiled = SpecCompiler().compile(spec, context)
   print(compiled.sql)
   print(compiled.params)
   PY
   ```
   This prints the generated BigQuery SQL and bound parameters ready for execution.

## Running the tests
- Execute the Phase 2 regression suite with:
  ```bash
  pytest backend/tests/test_analytics_engine_phase2.py \
         backend/tests/test_chart_schemas.py \
         backend/tests/test_golden_outputs.py \
         backend/tests/test_schema_validator.py \
         backend/tests/test_analytics_bigquery.py
  ```
  These cover compiler behaviour, schema validation, golden fixtures, and cache/engine wiring.

## Fixture locations
- Golden CSV input: `shared/analytics/fixtures/events_golden_client0.csv`
- Generated golden ChartResults: `shared/analytics/examples/`
- Compiler-specific helper fixtures: `backend/app/analytics/fixtures.py`

## BigQuery integration status
- The analytics engine currently executes entirely against pandas DataFrames sourced from fixtures or stubs. Live BigQuery connectivity (service account auth + table routing) is not yet wired into runtime execution.

## UI-facing behaviour you should rely on
- Occupancy buckets seeded solely by exit events maintain the carried occupancy value but downgrade coverage to ≤ 0.5; surface these points as low-confidence rather than authoritative counts.
- Dwell buckets without any paired sessions return `value = null` and `rawCount = 0`, indicating an intentional gap the UI should render as missing data.
- Retention heatmap cells scale coverage against the `_RETENTION_MIN_COHORT` (100) threshold so small cohorts appear with low coverage even when retention rates are high; preserve this signal in tooltips/legends.
- All time-series metrics (occupancy, activity, throughput, dwell) consume the shared canonical bucket calendar so buckets are never skipped and leading/trailing partial windows only influence coverage.
- Heatmap metrics (retention) return the full cohort × lag grid with deterministic ordering; cells are never omitted even when `rawCount = 0`.

## ChartResult contract (frontend binding)
- Each `series` entry exposes `id`, `label`, `unit`, `geometry`, `axis`, optional `meta`, and a `points` array.
- Time/ordinal points contain `bucket`, `value`, `rawCount`, `coverage`, and optional `surge`; `null` values are intentional gaps, not errors.
- Heatmap points contain `row`, `column`, `value`, `rawCount`, and `coverage`.
- Units stay human-readable (`people`, `events`, `events/min`, `minutes`, `%`) and should drive tick formatting.
- The backend contract is frozen for Phase 3: field names, bucket semantics, and coverage behaviour will not change without an explicit callout in the development plan.

## Next TODO items
1. Connect the BigQuery client used by `AnalyticsEngine` to the real service account and execute compiled SQL against per-client tables.
2. Expose the `/api/analytics/run` API endpoint (with `/analytics/run` alias for backward compatibility) so frontend consumers can request ChartResults over HTTP.
3. Extend caching beyond the local in-process backend (e.g., prepare Redis adapter) once live execution is stable.

## Handover summary for the next Codex (Phase 3 kickoff)
- **Phase 3 scope:** build and harden the shared `<ChartRenderer>` engine, unit-aware axis/series manager, and reusable card/KPI chrome that power the forthcoming Analytics Builder (Phase 4) and Dashboard (Phase 5). Existing pages remain untouched.
- **Read first:** `docs/dev_plan.md` Phase 3 section (deliverables, architecture, done criteria) plus `frontend/src/analytics/schemas/charting.ts` for the frozen `ChartResult` contract.
- **Storybook + fixtures:**
  - Run `npm --prefix frontend run charts:preview` to inspect fixtures without a backend.
  - Load `golden_dashboard_live_flow.json`, `chartresult_phase2_example.json`, `golden_dwell_by_camera.json`, `golden_demographics_by_age.json`, and `golden_retention_heatmap.json` via the Storybook controls.
  - Review the derived scenarios inside Storybook (low coverage, null dwell buckets, retention small cohorts, KPI variants, empty state, contract violation) to understand expected error/empty behaviours.
- **Frontend directories to touch:**
  - `frontend/src/analytics/components/ChartRenderer/` – orchestrator, primitives, managers, `ui/ChartErrorState|ChartEmptyState`, `utils/format.ts`, and stylesheet.
  - `frontend/src/analytics/components/Card/` – card chrome + KPI tile styling.
  - `frontend/src/analytics/utils/` – `loadChartFixture.ts`, `exportChart.ts`.
  - `frontend/src/analytics/stories/` – Storybook playground and visual QA matrix.
- **Key implementation notes:** rely on Recharts; never mutate analytics in the frontend; respect axis/palette/coverage rules; keep all chart logic within the shared engine; ensure the export stub posts `{ spec, specHash }` to the placeholder endpoint; preserve validation + error/empty states when integrating into new surfaces.

## Phase 4 kickoff pointers
- **Where to look first:**
  - `frontend/src/analytics/components/ChartRenderer/` (orchestrator, validation, primitives, managers, error/empty states, styling).
  - `frontend/src/analytics/components/Card/` (card chrome + KPI tile foundation).
  - `frontend/src/analytics/stories/ChartRendererPlayground.stories.tsx` (authoritative visual QA matrix and fixture wiring).
  - `shared/analytics/examples/*.json` (golden ChartResult fixtures for local prototyping before the API is connected).
- **How to run locally:**
  - `npm --prefix frontend run dev` – launches the frontend app; gate the new `/analytics/v2` workspace behind a feature flag when wiring UI shells.
  - `npm --prefix frontend run charts:preview` – opens Storybook with the full chart QA suite (no backend required).
- **Early implementation steps:**
  1. Scaffold the `/analytics/v2` shell (rail + canvas + inspector) under a feature flag.
  2. Hydrate a single Trend preset using `loadChartFixture` to drive `ChartRenderer` end-to-end.
  3. Replace fixture plumbing with live API calls once the shell and controls are stable.
- **Feature flags / configuration:** define an environment switch (e.g., `VITE_ENABLE_ANALYTICS_V2`) to isolate the new workspace during development and QA.
- **Feature flags / configuration:** define an environment switch (e.g., `VITE_ENABLE_ANALYTICS_V2`) to isolate the new workspace during development and QA.

### Phase 4 workspace toggles (current status)

- **Enable the workspace UI:** set `REACT_APP_FEATURE_ANALYTICS_V2=true` before running `npm --prefix frontend run dev`. When unset/false the `/analytics/v2` route is not registered and legacy `/analytics` remains untouched.
- **Switch transport mode:** set `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` (default) to load golden results via `loadChartFixture`, or `live` to proxy real `/api/analytics/run` calls once the backend endpoint is reachable.
- **Available presets:** the rail currently wires three presets end-to-end – `Live Flow` (entries vs exits), `Average Dwell by Camera`, and `Retention Heatmap`. Each ships with frozen backend-authored `ChartSpec` templates plus the time/split/metric overrides documented in `docs/analytics/phase4_workspace_plan.md`.
- **Override logging:** in dev mode the reducer logs every override mutation (`overrideApplied`) plus warnings (`overrideDenied`) if a component tries to touch a disallowed field. Use the browser console to verify overrides remain within the preset contracts when QAing new controls.
- **Transport diagnostics:** the workspace now categorises failures as `NETWORK`, `INVALID_SPEC`, `INVALID_RESULT`, `PARTIAL_DATA`, or `ABORTED`. The inspector surfaces these labels in error/notice badges while the console logs `run:start`, `run:success`, or `run:error` events with `specHash` for cache debugging.
- **Integrity guards:** the `/analytics/v2` page runs `useWorkspaceIntegrityChecks` during development to warn if parameter badges, legend visibility, or post-reset specs ever drift from their preset templates. Heed these console warnings while extending the workspace so overrides remain contract-safe.
