# Dashboard stabilisation checklist

## KPI sparklines (24h × 15-minute)
- **Entrances:** SUCCESS – VRM KPI series now densified in-engine to 96 buckets using backend time window and bucket metadata. See engine densification helpers.
- **Occupancy:** SUCCESS – same dense padding applied for VRM KPI scope.
- **Exits:** SUCCESS – dense padding applied.
- **Footfall:** SUCCESS – dense padding applied.
- **Dwell Time:** SUCCESS – dense padding applied.
- **Mechanism/tests:** VRM KPI series are zero-filled server-side via `_densify_vrm_series`, ensuring all buckets are present even when data is sparse; covered by analytics normalisation path (manual verification required pending fixture updates).

## Live Flow (dashboard.live_flow)
- **All-time selection:** SUCCESS – time resolution now clamps missing `from` values to a 1-year lookback instead of epoch, preventing runaway calendars.
- **Other ranges:** SUCCESS – bucket coarsening threshold reduced (`_MAX_CALENDAR_BUCKETS`=2000) to keep calendars bounded.
- **Bucketing policy:** Automatic coarsening remains, but calendar generation is constrained by the 1-year default start and max bucket guardrails.
- **Overflow protection:** SUCCESS – calendar construction respects the lower bucket cap, avoiding excessive `GENERATE_*` ranges.

## Timeouts
- **BigQuery job timeout:** SUCCESS – configurable `ANALYTICS_BQ_TIMEOUT_SECONDS` (default 300s) applied to `job.result()`.
- **API-level timeout:** PARTIAL – upstream FastAPI/clients unchanged; backend now waits longer, but UI timeout remains default.
- **Error surfacing:** PARTIAL – BigQuery timeout now explicitly configured; UI messaging unchanged.

## Demographics
- **Age/Gender/Race donuts:** SUCCESS – untouched; existing behaviour preserved.
- **Hour donut removal:** SUCCESS – no hour demographic code paths added back (no change required).

## Code hygiene
- **Unused hour demographics:** SUCCESS – none present; no additions.
- **Unused specs/components:** PARTIAL – primary bloat remains; no removals in this pass.
- **Tests/builds:** PARTIAL – backend pytest failed in this environment due to missing `backend/frontend_build/static`.

## Performance / BigQuery usage
- **Resource limits:** SUCCESS – bounded lookback and bucket caps mitigate array explosions; VRM KPI zero-fill occurs post-query without extra BQ cost.
- **Heavy queries:** PARTIAL – further optimisation may be needed with real datasets.

