# Production consolidation delivery

Exact base: `c52142ce88ecf4b2b16e2b527e0e02c1a02a79b7`.
Branch: `refactor/production-consolidation`, a separate cleanup branch/PR.

## Result

Production constructs one PostgreSQL/BigQuery/GCS service composition; it no
longer reads a backend-mode selector. Zero-site development and Memory Documents
are injected explicitly from test infrastructure through a development runner.
Test/development files are excluded from the production Docker context/image.

The six root `.7z` archives (79,102,065 bytes total) and eleven confirmed dead
application modules are removed. Unused JSON account-creation/alarm/device writers,
chart-auth helper, combined-log DB path, DataFrame/Storage API helpers, unused
exception/model/constants, frontend datepicker/ESLint dependencies and broken
proof-runtime script are removed. Retained dependency versions are unchanged.
Cookie Secure policy, frontend abort detection and the canonical Event table
constant are shared without merging customer/Admin security domains.

See [compatibility-surface.md](compatibility-surface.md) for the exhaustive retained
API/data surface. Historical adapters are quarantined under `backend/app/compatibility`;
canonical auth/domain services cannot import them or test/development infrastructure.
They cannot provide customer/Admin sessions or replace canonical services.
Contact journaling is active product behavior and remains unchanged. Its route,
validation and persistence implementation were compared against the exact base;
new HTTP tests cover append-before-delivery and persistence failure behavior.

## Validation

- Exact base: 382 existing backend tests passed against disposable localhost PostgreSQL.
- Cleanup: the same 382 tests passed; 13 new characterization/boundary cases also passed.
- All exposed API routes/models match the base's full OpenAPI schema digest.
- Admin/Documents/account focused TypeScript checks, phase-C and Reports/PDF engine
  tests and the production frontend build passed.
- Organisation-dashboard core and phone-country verification passed.
- Customer shell, UI polish, organisation access, account lifecycle, Documents and
  Admin browser suites passed on both the base and cleanup. The explicit zero-site
  development runner passed the existing real-login browser suite.
- Zero-data suite passed on both: 26 scenarios and 112 downloaded PDFs checked per run.
- Six fixed-clock Dashboard screenshots are pixel-identical to the exact base.
  Organisation-access desktop/phone/tablet and the empty desktop Documents capture
  also match exactly. Other live-clock/transition captures are not claimed as pixel baselines.
- All CSS, branding/image/SVG assets, frontend HTML/public manifest and route declarations
  are byte-identical to the base.
- Production image built using a temporary Dockerfile that injects the environment's
  trusted CA bundle into dependency-install steps as a BuildKit secret. Proxy host
  resolution was supplied externally. TLS verification and npm integrity checks
  remained enabled; repository Dockerfile and runtime trust are unchanged.
- Network-disabled image smoke verified static Home/deep links, unauthenticated
  customer/Admin/Documents guards, unchanged API schema and absence of dev/test fixtures.
  Production startup hooks were deliberately not run, so no canonical lifecycle cleanup
  or live Cloud SQL/BigQuery/GCS/Postmark operation occurred.
- `git diff --check` passed.

## Existing failures retained

Full-project `npm run typecheck` produces the same 60 TypeScript diagnostics at the
base and on this branch. Focused checks/build pass. The older auth-brand-assets
browser test fails on both revisions because its authenticated Home assertion
expects an `img[alt="camOS"]` that the base does not render. These checks/assertions
were not disabled or weakened, and unrelated product code was not changed to fix them.

## Review boundaries

No route/UI/style/copy/session format or TTL, database schema/grant, migration,
GCP/IAM/Cloud Run configuration or production-data change is included.
Dashboard zero-snapshot and strict Reports behavior remain distinct; customer and
Admin sessions retain distinct cookie names/purposes/validation.

Old compatibility readers still create/upgrade their historical JSON records where
that exposed API contract already did so. They are not canonical account creation.
Removing those semantics, the retained snapshot assets, interest journal or URL
compatibility requires a separate retirement decision; this PR preserves them.

Historical delivery notes are labeled historical. Current installation/test
instructions live in [development.md](development.md).
