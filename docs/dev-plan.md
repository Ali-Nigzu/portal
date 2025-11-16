# Dev Plan

## Product definition

A multi-tenant analytics portal for CCTV-derived events. Clients and admins use:

- **Dashboard**: Manifest-driven KPIs and charts per organisation.
- **Analytics workspace**: Curated presets (Live Flow, Occupancy, Dwell, Retention) with inspector overrides and pin-to-dashboard flows.
- **Admin tools**: User/session handling and view-token support for routing requests to the correct organisation.

## Architecture (high level)

Browser → React app → `POST /api/analytics/run` → Analytics engine → BigQuery → validated `ChartResult` → rendered chart/KPI.

Org mapping lives in the backend (`backend/app/analytics/org_config.py`) and resolves `client0`/`client1` to fully qualified BigQuery tables. Shared contracts in `shared/analytics` keep backend Pydantic models and frontend TypeScript types aligned.

## Modules & responsibilities

- **Backend**
  - Analytics engine: compiles ChartSpecs, executes BigQuery, normalises frames, validates `ChartResult` payloads.
  - Compiler: builds parameterised SQL from the analytics data contract; no ad hoc queries.
  - Data contract: enumerates metrics, dimensions, time ranges, and validation rules.
  - Org mapping: maps org slugs to datasets/tables and enforces per-request routing.
  - APIs: `/api/analytics/run` for charts, dashboard manifest endpoints for widget layouts.
- **Frontend**
  - Routing for dashboard, analytics workspace, and admin views.
  - Preset catalogue and inspector controls that assemble ChartSpecs.
  - Transports that post `{ spec, orgId }` to `/api/analytics/run` and render `ChartResult` responses.
  - Dashboard widgets that call the same analytics endpoint and honour manifest layouts.

## Current status

- Live BigQuery transport is the default for dashboard and analytics workspace.
- Manifest endpoints serve KPI bands and charts; pin/unpin flows reuse the analytics endpoint.
- Phase 2 validator is enforced on every backend response; frontend mirrors the same contract for rendering.

## Roadmap (near term)

- UX polish for inspector presets and admin view-token flows.
- Additional presets (e.g., camera/site comparisons) built on the existing compiler abstractions.
- Performance tuning: cache strategy and BigQuery partition pruning.

## Development workflow

To add a new metric or preset:

1. Extend the analytics data contract (metric/dimension definitions, validation) in `backend/app/analytics/data_contract.py`.
2. Update compiler support to generate SQL for the new metric using canonical columns only.
3. Add backend tests that cover SQL generation and `validate_chart_result` output.
4. Add a frontend preset and any required schema typings in `frontend/src/analytics/schemas`.
5. Verify end-to-end via `/api/analytics/run` and ensure dashboard pins render the new result.
