# Phase 1 – Specification & Metric Foundations

This checklist mirrors the Phase 1 deliverables from `ANALYTICS_DEVELOPMENT_PLAN.md` and
records the current status before we begin Phase 2.

## Deliverables

| Item | Status | Notes |
| --- | --- | --- |
| ChartSpec JSON Schema + TypeScript types | ✅ Complete | `shared/analytics/schemas/chart-spec.schema.json` with matching TS interfaces in `frontend/src/analytics/schemas/charting.ts`. |
| ChartResult JSON Schema + TypeScript types | ✅ Complete | `shared/analytics/schemas/chart-result.schema.json` with mirrored TS models. |
| SQL template documents (occupancy, activity, throughput, dwell, demographics, retention) | ⚠️ Pending | Outline drafted for Phase 2 design; actual template specs will be authored alongside the compiler work. |
| BigQuery table partition/cluster validation | ✅ Complete | `backend/app/analytics/schema_validator.py` asserts canonical schema and partitioning for per-client tables. |
| Golden dataset fixtures + expected outputs | ✅ Complete | Fixture CSV in `shared/analytics/fixtures` with deterministic JSON in `shared/analytics/examples`. |
| Schema validation tests in CI | ✅ Complete | `backend/tests/test_chart_schemas.py` and `backend/tests/test_schema_validator.py`. |

## Ticket Skeleton Progress

| Ticket | Status | Notes |
| --- | --- | --- |
| 1. Draft ChartSpec schema (TS + JSON Schema) | ✅ | Completed in shared schemas + TS models. |
| 2. Draft ChartResult schema (TS + JSON Schema) | ✅ | Completed in shared schemas + TS models. |
| 3. Validate BigQuery table partitioning/cluster assumptions; create views if missing | ✅ | Validator enforces canonical schema and partition hints; per-client tables supported via mapping. |
| 4. Implement SQL templates for occupancy/activity/throughput | ⚠️ Pending | To be addressed in Phase 2 compiler design. |
| 5. Implement SQL templates for dwell/demographics/retention | ⚠️ Pending | Scheduled for Phase 2 implementation. |
| 6. Create golden dataset fixtures in BigQuery | ✅ | CSV fixture ready for loading; documentation covers loading commands. |
| 7. Generate expected JSON outputs from fixtures | ✅ | Stored in `shared/analytics/examples`, regenerated via `generate_expected.py`. |
| 8. Implement schema validation tests (spec + result) | ✅ | Tests added under `backend/tests`. |

## Outstanding Questions / Decisions

- SQL template authoring and compiler wiring will be completed during Phase 2.
- Awaiting confirmation on any additional preset copy changes (product-owned).

