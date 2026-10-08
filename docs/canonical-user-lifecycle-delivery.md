# Delivery record: locked-contract lifecycle correction

Correction parent: `e3de572c9c9b89ba00d3a152e080d19b20bfc25b`.
Original requested PR base: `ba965b21b7b928917b3ac14e777efd45677c70d1`.
Branch: `feat/canonical-user-lifecycle`.

This correction restores canonical login against the locked PostgreSQL contract,
removes the rejected durable metadata and separate limiter table, and uses one
opaque handle plus the existing challenge row for reset/unlock authorization.
No signed lifecycle grant helper is present. Documents ownership behavior returns
to the original username session tuple; Documents APIs/storage are unchanged.
The polished account UI remains, with Lock editing now deleting its authorization.

No production database connection, migration, grant, live Postmark send or GCP
change was performed. SQL files are future-environment administrator source;
production schema and privileges were already applied by the owner. Disposable
localhost PostgreSQL databases were created and changed for tests only.

## Final contract and behavior

CanonicalUser has exactly `id`, `email`, `username`, `phone_number`,
`password_hash`, `status`, `session_version`. Login reads only canonical users;
it works even if challenge storage is unavailable. Signup omits id, using the
existing BY DEFAULT identity and public.users_id_seq, and explicitly inserts
CURRENT_TIMESTAMP for created_at because that column has no default. Existing
IDs are retained and signup creates no membership. session_version starts at 0.

The only lifecycle table has the locked twelve columns and numeric purposes
0 signup, 1 reset, 2 unlock. Pending rows last one hour, codes fifteen minutes,
with five wrong attempts, five resends and a thirty-second cooldown. Signup
payload holds only canonical creation fields and an Argon2 hash; reset/unlock
payloads are empty. Only digests of handles/codes are stored. SQL uses row locks,
parameterized values and transactional completion; sending email follows commit.

Signup deletes its completed row in the user-creation transaction. Reset
verification retains the same row/handle for ten minutes; completing the reset
updates the password hash and version, then deletes that user's reset/unlock
rows. Unlock verification retains its row for five minutes of profile editing.
Lock editing/logout remove the current unlock; credential changes invalidate all
that user's reset/unlock rows and prior canonical sessions. Profile changes write
only submitted fields. Account password change rotates the current session.

Startup and lifecycle requests perform bounded, best-effort cleanup of expired
or consumed rows, at most 100 per batch, with SKIP LOCKED and short local SQL
timeouts. Cleanup failure cannot fail the journey; no scheduler or manual cleanup
is required. Without startup or traffic, deletion waits for the next opportunity.
Expired rows never authorize actions. Per-challenge limits intentionally provide
no replacement global login/repeated-start limiter.

## Commands and results

| Command/check | Correction result |
| --- | --- |
| `PORTAL_TEST_POSTGRES_PORT=55432 .venv/bin/python -m pytest -q backend/tests` | 272 passed, 9 framework/dependency deprecation warnings, 15.09s |
| Locked-schema/restricted-role cases in backend suite | Exact user/challenge columns, identity allocation, sequence-safe rerun, actual indexes/grants, durable attempts, atomic completion, deletion, expiry and cleanup passed; runtime DDL and users DELETE rejected |
| `npm run typecheck:account` | Passed |
| `npm run build` | Passed; 3,037 modules, 5.66s |
| `npm run test:phase-c` | Passed |
| `npm run test:reports-engine` | Passed, including PDF checks |
| `npm run verify:phone-countries` | Passed; 115 entries |
| `npm run test:account-lifecycle` | Passed against real API/PostgreSQL and local HTTP Postmark stub; desktop/mobile, Lock editing, phone add/edit/remove, password reset, refresh/logout/login persistence |
| `npm run test:organisation-access` | Passed; desktop/phone/tablet, two-user workflows, existing login, pending isolation, declines/withdraw/disable, Contact and zero-site modules |
| `npm run test:authenticated-shell` | Passed |
| `node scripts/authenticated-ui-polish-browser.mjs` | Passed |
| `node scripts/authenticated-zero-data-browser.mjs` | Passed; 26 scenarios, 112 PDF downloads verified with pdftotext |
| `npm run typecheck` | Baseline failure: 64 diagnostics; identical file/error-code counts to e3de572, versus 65 at original base |
| `git diff --check` | Passed |
| Rejected dependency source search | No matches in backend application/tests/SQL or frontend source; no signed lifecycle grant helper file |

Browser commands use PORTAL_BROWSER_EXECUTABLE=/usr/bin/chromium (Chromium 151).
Lifecycle/organisation commands also use PORTAL_TEST_POSTGRES_PORT=55432 and
PORTAL_TEST_PYTHON=/workspace/portal/.venv/bin/python. PostgreSQL 17 is local;
CI retains version 16. Desktop/mobile screenshots under ignored
frontend/test-results/account-lifecycle were inspected. Logs are in
/tmp/portal-correction-*.log. These checks do not prove live Cloud SQL/Postmark.

The earlier implementation run also established a failing legacy authenticated
brand-logo assertion at frontend/scripts/auth-brand-assets-browser.mjs:154 on
both implementation and untouched original base. That test was not rerun for
this correction. No unrelated analytics typing or shell artwork was changed.
The shell browser printed an external resource tunnel error but its assertions
passed. Backend warning count includes the added startup event registration.

## Legacy boundaries and deviations

Canonical signup/login/reset/account writes have no JSON fallback or dual writes.
Explicit non-production legacy Basic support, legacy view-token mappings and
admin/demo/contact/register-interest/local-fixture paths remain outside scope;
view-token revocation is not claimed to follow session_version. Legacy lifecycle
endpoints remain retired as in the parent implementation. There are no deviations
from the approved locked-schema brief. Cleanup timing and per-challenge-only
abuse bounds are documented operational limits, not additional schema proposals.

## Exact correction file manifest

All entries below are modifications relative to correction parent e3de572.
No application file is added or removed. The documentation file is included in
its own manifest. Generated fixture Documents data is excluded from the commit.

```text
M	backend/ENVIRONMENT.md
M	backend/app/api/auth.py
M	backend/app/api/user_lifecycle.py
M	backend/app/app_factory.py
M	backend/app/auth.py
M	backend/app/models.py
M	backend/app/services/canonical_auth.py
M	backend/app/services/user_lifecycle.py
M	backend/app/services/user_lifecycle_repository.py
M	backend/migrations/002_canonical_user_lifecycle.sql
M	backend/migrations/002_canonical_user_lifecycle_grants.sql
M	backend/tests/membership_postgres.py
M	backend/tests/test_local_new_account.py
M	backend/tests/test_phase_c_auth.py
M	backend/tests/test_user_lifecycle.py
M	docs/canonical-user-lifecycle-delivery.md
M	docs/canonical-user-lifecycle.md
M	frontend/scripts/account-lifecycle-browser.mjs
M	frontend/src/features/auth/transport/me.ts
M	frontend/src/features/settings/api/settingsApi.ts
M	frontend/src/features/settings/pages/MyAccountPage.tsx
M	frontend/src/features/settings/types.ts
```

The final commit SHA is supplied in the completion response; this delivery record
is itself part of that commit. Full behavior/source details are in
[canonical-user-lifecycle.md](canonical-user-lifecycle.md).
