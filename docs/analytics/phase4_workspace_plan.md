# Phase 4 – Analytics Workspace Implementation Plan

## Mission Recap
Phase 4 delivers the preset-first Analytics Workspace living under `/analytics/v2`. The UI must expose a curated catalog of backend-authored presets, a single active chart/KPI card rendered exclusively through the shared `ChartRenderer`, and a guided inspector that allows only safe spec overrides (time window, filters, splits, dimension/measure selection within preset allowances). No backend or chart engine modifications are permitted.

## Clarified Requirements and Answers
1. **Single-card layout only.** Every preset renders exactly one Card (which may contain KPI tiles + charts supplied by `ChartRenderer`). Multi-card/dashboard layouts remain a Phase 5 responsibility.
2. **Entity catalogue abstraction.** Site/camera selectors consume an `EntityCatalogueProvider` interface. Phase 4 ships with a fixture-backed provider but the UI must be ready to swap in backend-backed providers without refactoring controls.
3. **Icon usage.** Preset tiles use the existing design-system icon set (chart, clock, layers, etc.). Icons act as consistent placeholders until Phase 5 visual polish replaces them globally.

## Non-Negotiable Constraints (Must Be Enforced Everywhere)
- **Zero frontend metric logic.** The UI may never compute occupancy, dwell, retention, throughput, activity, percentiles, deltas, coverage, bucket math, or similar analytics. All numbers must be displayed exactly as provided by backend `ChartResult` payloads.
- **Preset specs are frozen contracts.** Each preset references a backend-authored `ChartSpec` template that is treated as immutable—measure units, labels, IDs, axis bindings, canonical buckets, aggregation types, dataset references, and metadata cannot be altered in the frontend. Only override fields declared as "user-editable" in the preset schema may be changed (time window, filters, splits, and curated measure/dimension toggles). The plan, typings, and UI must enforce this rule.
- **`ChartRenderer` is the only rendering engine.** No custom chart primitives. KPI tiles, time series, bars, flow, heatmaps—everything routes through `ChartRenderer` and its provided Card chrome.
- **Canonical empty/error states.** All loading failures or empty results surface via the shared `<ChartEmptyState />` and `<ChartErrorState />` components; no local bespoke error UI.
- **Feature-flag isolation.** `/analytics/v2` sits behind its feature flag, imports must not mutate global layouts, and no existing `/analytics` behavior may be affected.

### Allowed UI Overrides

| ChartSpec Field | Editable in UI? | Notes |
| --- | --- | --- |
| `timeWindow` | ✔ Yes | Must use canonical bucket presets defined in the template (e.g., hourly/daily) with no custom intervals. |
| `filters` | ✔ Yes | Only filter fields enumerated in the preset metadata may be toggled. Values must respect backend-supported operators. |
| `splits` | ✔ Yes | Limited to the preset's approved dimension list; UI validates against allowed IDs before applying. |
| `selectedDimensions` / `selectedMeasures` | ✔ Yes (when preset allows) | Only the curated subsets described in the preset schema can be toggled; cannot add/remove backend-authored measures. |
| `entityIds` / site & camera selectors | ✔ Yes | Values come from the `EntityCatalogueProvider`; spec mutation restricted to supported entity keys. |
| `bucketSize` | Limited | Only if the preset exposes a whitelist of canonical bucket sizes; otherwise read-only. |
| `dataset` | ✘ No | Dataset ownership remains backend-only. |
| `measures` definition | ✘ No | Cannot add/remove measures or change aggregation/units/labels. |
| `labels`, `units`, metadata | ✘ No | Immutable presentation data coming from backend. |
| `axis` / `series` assignments | ✘ No | Determined by the template and not user-editable. |

All preset definitions must explicitly list their editable fields so TypeScript can reject accidental overrides at compile time.

## Implementation Plan (Updated)
1. **Workspace shell scaffolding**
   - Add the feature-flagged route `/analytics/v2` with a responsive three-pane layout (left preset rail, center card canvas, right inspector).
   - Reuse the existing Card chrome to wrap `ChartRenderer`, ensuring the main canvas handles loading, empty, and error states.

2. **Preset catalog integration**
   - Define a strongly typed preset registry (e.g., `frontend/src/analytics/workspace/presets/catalog.ts`). Each entry references a backend-authored `ChartSpec` template ID and enumerates its allowed override controls.
   - Build the left rail UI with tab grouping, search, icon + description tiles, and selection state synced to the active preset.

3. **Spec hydration + ChartRenderer wiring**
   - On preset selection, clone its template spec, apply inspector overrides (time, filters, splits, dimension toggles) guarded by TypeScript types/read-only config, and pass the result to the analytics transport.
   - Use the existing transport abstraction to switch between fixture mode (`loadChartFixture`) and live `/analytics/run` requests. Enforce canonical empty/error rendering through shared components.

4. **Controls and editable spec layer**
   - Implement inspector panels for time range, site/camera, filters, and splits. Respect preset capabilities by disabling unsupported options with tooltips.
   - Ensure entity selectors are powered via the `EntityCatalogueProvider` abstraction (fixture-backed for now).
   - Integrate export controls (existing stub) and rely on `ChartRenderer` series visibility toggles.

5. **KPI + chart rendering**
   - Support KPI-only presets by feeding their `ChartResult` into `ChartRenderer`’s KPI tile handling. For mixed KPI+chart presets, keep all visualization logic inside the single Card.

6. **QA workflow + documentation**
   - Document dev commands (`npm --prefix frontend run dev`, `npm --prefix frontend run charts:preview`) and feature-flag toggling steps.
   - Record how to switch the transport between fixtures and live API and how to validate responses using the existing golden fixtures.

## Transport Layer Contract

- **Mode selection.** The workspace transport inspects an environment toggle (e.g., `useFixtures`) to decide between `loadChartFixture` and live `/analytics/run`. Both share the same input signature `{ spec, specHash }` to keep behavior deterministic.
- **Spec hashing.** Spec hashes are generated via the existing deterministic hashing helper already used by the backend cache. Each request logs `{ presetId, specHash, mode }` for QA traceability.
- **Validation.** Every response must be validated against the shared ChartResult schema/types before reaching `ChartRenderer`. Invalid payloads throw and route to `<ChartErrorState />`.
- **Empty/error handling.** Transport-level errors (network, validation) surface through `<ChartErrorState />`. Valid but empty datasets must render `<ChartEmptyState />`. Loading indicators continue to use the Card chrome skeletons.

## Do NOT Touch – Frozen Areas

Phase 4 must not modify or override any of the following:

- Backend analytics engine, compiler, or metric logic (occupancy/dwell/retention/etc.).
- Canonical bucket calendars, coverage/rawCount semantics, or ChartResult schema definitions.
- Shared ChartRenderer primitives, KPI tiles, or Card chrome components.
- Existing `/analytics` route behavior, feature flags, or global layout styles.

Any change touching the above areas violates the Phase 4 contract and must be deferred to later phases with explicit approval.

## Folder Structure Blueprint

```
frontend/src/analytics/v2/
  pages/
    AnalyticsV2Page.tsx
  layout/
    WorkspaceShell.tsx
    LeftRail.tsx
    InspectorPanel.tsx
  presets/
    presetCatalogue.ts
    types.ts
  state/
    workspaceStore.ts
  transport/
    runAnalytics.ts
    fixtureProvider.ts
    entityCatalogue.ts
  controls/
    TimeControls.tsx
    FilterControls.tsx
    SplitControls.tsx
  components/
    PresetTile.tsx
    PresetTabs.tsx
```

This structure keeps presets, state management, transport logic, and UI building blocks isolated yet composable. Additional files (e.g., hooks) must live under the most relevant folder to avoid cross-cutting dependencies.

## QA Test Matrix

| Test Category | Scenario | Expected Result |
| --- | --- | --- |
| Preset loading | Select each preset from the rail | Card shows loading skeleton, then renders `ChartRenderer` output using live or fixture data. |
| Spec overrides | Adjust time window, filters, and splits within allowed ranges | Outgoing spec diff matches allowed fields only; UI prevents disallowed overrides. |
| Entity selectors | Switch sites/cameras using fixture provider | Spec updates entity IDs; dependent controls refresh, and analytics query re-runs. |
| Time controls | Toggle presets (e.g., Last 24h vs 7d) | Bucket size stays canonical; spec hash changes; ChartRenderer updates accordingly. |
| Split/filter validation | Attempt to pick disabled dimensions/filters | Controls show disabled states/tooltips; no spec mutation occurs. |
| Empty/error handling | Force fixture returning empty/errored payload | `<ChartEmptyState />` or `<ChartErrorState />` surfaces with retry affordance, no crashes. |
| Partial-data handling | Load fixture metadata with `meta.partialData=true` | Canvas badge + inspector warning appear; ChartRenderer still renders canonical data. |
| Retention guardrail | Render retention heatmap fixture | No missing cohort columns; validator would fail if grid gaps appear. |
| KPI-only preset | Load KPI fixtures | KPI tiles respect units/deltas and highlight low coverage correctly. |
| Export stub | Trigger export action | Export stub receives `{ spec, specHash }` and logs payload per existing contract. |
| ChartRenderer interactions | Toggle legend series visibility | Built-in legend handles visibility; inspector summary remains consistent. |

QA must cover both fixture and live transport modes, Storybook scenarios, and regression against golden fixtures before shipping.

## Phase 4 – Current Implementation Status

- `/analytics/v2` now renders the new workspace shell behind the `REACT_APP_FEATURE_ANALYTICS_V2` flag without mutating legacy `/analytics` routes.
- The preset rail lists all backend-authored templates and selects a default preset that automatically hydrates its immutable `ChartSpec`, hashes it, routes through the analytics transport (fixtures for now), and renders the returned `ChartResult` inside `<ChartRenderer>`.
- Inspector controls cover time ranges, curated measure sets, and split toggles; each override is deep-cloned from the preset template, logged at runtime, and validated against the preset’s allowed fields before a query run begins.
- Parameter badges, preset detail copy, and a live series-summary list now reflect the active spec state; legend visibility changes inside `ChartRenderer` stay in sync with the inspector summary via the shared `SeriesVisibilityMap` plumbing.
- Workspace state exposes reset + cancel/run-again affordances. Preset switching clears overrides, time windows never leak across presets, and the reducer filters any disallowed override fields (dev-mode warnings fire when a component attempts to mutate a forbidden field).
- Deterministic spec hashing, export stubs, and fixture-based entity catalogues remain wired via the transport abstraction so switching to `/analytics/run` only requires updating the transport flag.

### Override logging + UX guardrails

- Every override mutation now logs `overrideApplied: { presetId, field, oldValue, newValue }` in dev mode so future regressions are traceable.
- Attempts to mutate a disallowed override field emit `overrideDenied` warnings (still dev-only) and are ignored by the reducer, guaranteeing presets remain authoritative.
- Preset template specs are deep-frozen during catalog registration to ensure accidental mutations throw early in development.
- Manual reset + cancel controls guarantee there is never a state where “old preset + new overrides” leak into the canvas; override resets always re-run the preset to rebuild canonical specs.

### Workspace lifecycle + integrity loop

1. **Preset selection** – selecting a tile resets overrides, clones the frozen template, and locks a session-level clock so “default” specs remain deterministic until refresh.
2. **Override mutation** – inspector controls dispatch reducer actions; dev logging records every mutation and `useWorkspaceIntegrityChecks` warns if badges/specs drift.
3. **Transport run** – the spec hash + preset id are logged before transport executes (fixtures vs `/analytics/run`), and `AbortController` supports cancel/retry actions.
4. **Render + inspect** – `ChartRenderer` handles success paths while inspector badges/legend summaries stay synced to legend visibility + override state.
5. **Reset** – the reset action rebuilds the spec from the immutable template using the same session clock so the payload matches the initial render byte-for-byte.

Any deviation in this loop triggers console warnings (badge mismatch, spec drift, legend sync) during development so regressions cannot silently ship.

### Transport error categories

| Category | Meaning | UI Behaviour |
| --- | --- | --- |
| `NETWORK` | Fetch/post failure, 5xx responses, or unexpected client errors. | Inspector shows error badge and `<ChartErrorState />` renders with retry controls. |
| `INVALID_SPEC` | Backend rejected the ChartSpec (4xx) before execution. | Error state + spec hash logged to console for debugging. |
| `INVALID_RESULT` | Payload failed ChartRenderer validation (missing series, unsupported units, retention gaps). | Transport halts before render; ChartErrorState displays validation issues. |
| `PARTIAL_DATA` | Backend marked the response as partial (low coverage, incomplete window). | Canvas/inspector show a “Partial data” badge but still render the result. |
| `ABORTED` | User cancelled the request or navigation interrupted it. | Inspector transitions to “Idle”; manual rerun is available without error copy. |

These categories are emitted via `AnalyticsTransportError` so future Codex instances can hook telemetry/toasts without reverse-engineering error semantics.

### Guardrail tests + stories (added this iteration)

- `frontend/src/analytics/v2/state/workspaceStore.test.ts` locks the override guardrails: preset selection resets overrides, disallowed overrides are ignored, and override state never leaks between presets.
- `frontend/src/analytics/components/ChartRenderer/__tests__/ChartRendererStates.test.tsx` verifies `ChartErrorState`, `ChartEmptyState`, and KPI tiles render correctly.
- `frontend/src/analytics/components/ChartRenderer/__tests__/PaletteManager.test.ts` ensures split palettes retain deterministic colors across SeriesManager/PaletteManager instances.
- Storybook now includes explicit stories for invalid specs → error state, null-only data → empty state, KPI tiles, split palette consistency, and canonical retention heatmaps (no missing columns), alongside the existing live fixture demos.

### Upcoming sprint scope (Phase 4 hardening backlog)

- Ship entity selector controls (site / camera) powered by the fixture-backed catalogue abstraction so the UI is ready for backend enumeration endpoints.
- Expand inspector UX with collapsible sections, filter summaries, and Storybook snapshots that exercise keyboard/focus affordances.
- Add Saved View scaffolding (naming + persistence shell) without exposing Phase 5’s multi-card dashboards yet.
- Introduce workspace-level Playwright smoke tests once the Storybook QA suite stabilises, complementing the Jest guardrails already in place.

## Phase Boundaries
- **Phase 4 delivers:** preset catalog rail, single-card workspace shell, controlled spec editing layer, transport abstraction, fixture-driven entity selectors.
- **Phase 5 and beyond:** multi-card dashboards, dynamic backend entity catalogs, advanced spec editing (Phase 7), and bespoke visual polish passes.

## Pre-Coding Checklist
- [ ] Confirm feature flag + routing strategy for `/analytics/v2` is documented.
- [ ] Finalize preset catalog structure and associated `ChartSpec` template references.
- [ ] Define `EntityCatalogueProvider` interface and fixture implementation.
- [ ] Outline inspector control configurations per preset (allowed overrides, disabled states).
- [ ] Verify transport abstraction covers fixture + live API scenarios.
- [ ] Align QA workflow notes with Storybook/fixtures for regression validation.

