# Self-service organisations and membership access

Implementation base: `580ffaabbfbd75950d9da0a1153a4624962830a4`.

The existing authenticated backend writes canonical PostgreSQL organisations
and memberships. Browser state is a projection of those APIs, never membership
authority. No signup persistence, analytics, site access model, or GCP
configuration is changed by this feature.

## Roles, status and authority

Role `0` is Owner and `1` is Member. Creation makes the session user an active
Owner. Every invitation and access request assigns Member server-side; the API
rejects role, actor identity and site-selection fields. Both roles retain the
same ordinary organisation-wide Portal access. Owners alone read the management
roster and invite/withdraw/approve/decline/disable relationships.

Only `memberships.status = 1 AND organisations.enabled = TRUE` authorises normal
Portal resources. Statuses are `0` Disabled, `1` Active, `2` Invited, `3` Requested.
There remains exactly one row per `(user_id, organisation_id)`.

| Operation | Allowed starting states | Result |
| --- | --- | --- |
| Invite existing enabled user | None, Disabled | Invited, Member |
| Request by enabled organisation ID | None, Disabled | Requested, Member |
| Accept own invitation | Invited | Active, Member |
| Decline own invitation / withdraw invitation | Invited | Disabled |
| Approve request | Requested | Active, Member |
| Decline request | Requested | Disabled |
| Disable another active relationship | Active | Disabled |

Duplicate pending submissions and decisions already in their terminal state
are harmless `200` responses, with no new write or timestamp. Inviting/requesting
an active relationship conflicts. Invite versus request conflicts rather than
overwriting intent. Missing relationships return `404`; incompatible/stale
decisions return `409`. Personal actions target the session user. Management
requires current active Owner authority in that organisation; unrelated scopes
are concealed with `404`, while active Members receive `403` for management.

Self-invite and self-disable are rejected. The last active Owner is protected.
The UI offers disabling Members only, with no ownership transfer or role editor.
Existing multiple-Owner data is preserved.

`created_at` remains original relationship creation time. `status_changed_at`
advances on actual transitions; duplicates preserve it. Decision bodies carry
the displayed nullable timestamp, preventing old approvals/declines/disables
from affecting a later relationship state. Disabled is not a permanent ban:
re-invitation/request is allowed. This is current-state metadata, not an audit
log or decline-reason history.

## Backend and transaction behaviour

- Router: `backend/app/api/organisation_memberships.py`.
- Service: `backend/app/services/organisation_memberships.py`.
- SQL repository: `backend/app/services/organisation_membership_repository.py`.
- Shared connector: `DashboardPostgres.transaction()` checks out one DBAPI
  connection, disables driver autocommit, commits/rolls back, restores autocommit
  and releases it. Broken commit/rollback/reset invalidates the connection.
  Existing `connection()` read semantics remain unchanged.
- Creation uses `INSERT ... RETURNING id`, then inserts creator membership on
  the same connection. Failure rolls back both rows; sequence gaps are normal.
- Existing-organisation writes take a transaction-scoped advisory lock using
  `hashtextextended('camos:memberships:<id>', 0)`. Re-read actor/organisation/
  membership after locking, then use conditional updates. This serializes even
  absent relationship inserts and concurrent Owner actions. External writers
  must coordinate with the same policy; no cross-service locking is implied.
- No network/email/analytics work is performed inside membership transactions.

Mutation requests use JSON and `X-Requested-With: camOS`; browser Origin must
match the request's application origin or configured application origins.
Cross-site fetches are rejected. Success, validation, authorisation and domain
error responses carry `Cache-Control: no-store`. IDs are decimal strings in
JSON, preserving PostgreSQL bigint values; user ID zero remains supported.

## API

All paths below start with `/api/portal`:

| Method/path | Body / response |
| --- | --- |
| `POST /organisations` | `{name}` → `201 {organisation:{id,name,role:0,sites:[]}}` |
| `GET /me/memberships/pending` | `{invitations:[],requests:[]}` for the actor only |
| `GET /organisation-access/{id}` | Organisation name/ID, caller relationship, `can_request`; enabled organisations only |
| `POST /organisation-access/{id}/requests` | `{}` → `{membership}` |
| `POST /me/invitations/{id}/accept` or `/decline` | `{expected_status_changed_at}` → `{membership}` |
| `GET /organisations/{id}/access` | Organisation header, `actor_role`, `can_manage`, management lists; lists empty for Member |
| `POST /organisations/{id}/invitations` | `{identifier_type:"email"\|"username",identifier}` → `{membership}` |
| `POST /organisations/{id}/invitations/{user_id}/withdraw` | Expected timestamp → `{membership}` |
| `POST /organisations/{id}/requests/{user_id}/approve` or `/decline` | Expected timestamp → `{membership}` |
| `POST /organisations/{id}/members/{user_id}/disable` | Expected timestamp → `{membership}` |

New pending relationship inserts return `201`; existing-row transitions and
duplicate submissions return `200`. Errors use `{detail:{error,message}}`.
Lookup uses only the selected case-insensitive email or username index, avoiding
cross-column ambiguity. Unknown/disabled users cannot produce partial writes.
No user lookup directory or account creation endpoint is added.

## User experience and refresh boundaries

The existing primary organisation navigation has Add Organisation and Request
Access even with zero active organisations. Invitations and requests have
separate pending labels and lead to personal access decisions in Settings;
they never appear as active catalogue organisations. Home remains unchanged.

Settings → Manage Access uses explicit `organisation_id` query scope when
opened from a Portal organisation, with a selector for multiple organisations.
It shows the real organisation ID and Copy feedback, canonical membership
lists for Owners, and a non-management explanation for Members. Personal
invitations/requests remain reachable with no active organisation. Fake Site
permissions and local-only Save state are removed.

Own create/accept actions refresh the canonical catalogue without a page reload.
Focus/visibility changes refresh catalogue and pending state. Scoped access
failures trigger canonical refresh; revoked organisation routes return Home.
No push service is introduced, so remote changes become visible at those
boundaries. Failed reads do not replace valid catalogue state with an empty
success. Favourites retain their existing catalogue hydration/pruning behaviour.

Existing `/contact` is available to logged-in users for unknown-target guidance.
Canonical signup is still outside scope: live invite targets must already exist
in `public.users`. Creating a legacy JSON account does not satisfy that condition.

## Administrator migration and deployment

1. Back up canonical data and inspect effective schema/grants. Audit other
   consumers of `memberships.status` outside this repository.
2. Use a privileged administrator connection to the intended database
   `camosbase:europe-west2:camos-prod-postgres`, database `camos_prod`.
3. Run `psql -v ON_ERROR_STOP=1 -f backend/migrations/001_organisation_membership_states.sql`.
   This is a one-time transaction with bounded lock/statement timeouts. It
   discovers and validates the existing status-only CHECK, expands its allowed
   values, adds nullable `status_changed_at`, and sets the future-insert default
   separately. Historical rows stay NULL. Pending rows require a timestamp.
   Unexpected or already-migrated schemas fail explicitly; inspect before retry.
4. Verify existing Demo role/status and historical timestamps are unchanged.
5. Deploy this application only after migration. Confirm stable existing
   `PORTAL_SESSION_SECRET`, live backend mode, existing Cloud SQL IAM identity
   and configured application origins. No secret value belongs in this document.
6. Execute live acceptance below. No production migration or deployment is
   performed by the local test commands.

Runtime grants required are exactly organisation SELECT/INSERT, identity
sequence USAGE, membership SELECT/INSERT/UPDATE, user SELECT, plus existing
Portal read privileges. Do not grant DDL, organisation UPDATE/DELETE, membership
DELETE, ownership or a blanket writer role. The advisory-lock approach does not
need `SELECT FOR UPDATE` privileges on organisations.

For application rollback, retain the additive schema. Do not restore the old
status CHECK while Invited/Requested rows exist, and do not bulk disable them as
an automatic rollback. Migration lock timeout is a safe failure; coordinate a
quiet window before a diagnosed retry.

## Automated validation

From repository root, install `backend/requirements-dev.txt` in a virtualenv.
From `frontend`, use `npm ci` and install Playwright Chromium (or specify an
existing Chromium through `PORTAL_BROWSER_EXECUTABLE` for the new browser suite).

Start a disposable local PostgreSQL instance, for example:

```sh
docker run --name portal-membership-tests \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 -d postgres:16-alpine
PORTAL_TEST_POSTGRES_PORT=55432 python -m pytest -q backend/tests
```

Only the localhost port is configurable for these tests. Each fixture creates
and drops its own uniquely named database. Integration tests skip without that
variable; a run with skips does not establish SQL/concurrency readiness.

From `frontend`, with Vite running (`npm run dev`):

```sh
npm run test:phase-c
npm run test:reports-engine
npm run test:authenticated-shell
node scripts/authenticated-ui-polish-browser.mjs
node scripts/authenticated-zero-data-browser.mjs
PORTAL_TEST_POSTGRES_PORT=55432 npm run test:organisation-access
npm run build
```

Set `PORTAL_TEST_PYTHON` if the browser runner must use a particular virtualenv.
Port 8000 must be free: the new browser suite starts/stops its own real API and
disposable database. It uses the existing canonical login, real SQL service and
zero-site Portal services, not a fake membership backend. Screenshots and
failure evidence go under `frontend/test-results/organisation-access`.

The SQL suite also exercises these workflows with only the documented runtime
grants. The browser suite holds requests to assert loading/submitting states,
blocks repeated creation submissions and injects one recoverable storage failure;
successful workflows always use the real canonical API and SQL.

Existing `local-new-account` mode remains a read-only development fixture; new
membership mutations require canonical storage and deliberately return
unavailable in that mode. It must never become a fake persistence implementation.
The GitHub workflow runs the PostgreSQL suite, browser checks and production build.
It also runs the existing local-new-account browser regression against that
isolated fixture backend, after the real membership browser runner stops.

## Later live GCP acceptance

An administrator supplies existing/manual canonical enabled Users A/B (and C
if useful), with B initially having zero organisations. No product test-user
creation is provided. Agree on retention before creating test organisations,
since organisation deletion is excluded.

1. A creates zero-site Org A through navigation; verify generated ID and active
   Owner membership in PostgreSQL.
2. B uses the zero-org shell. A invites B by email; B has no scoped access until
   accepting. Verify status 2 → 1 and normal catalogue appearance.
3. Exercise username lookup, invitation decline, withdrawal, duplicates and
   conflicting pending states. Nonexistent target creates no user/membership.
4. B creates zero-site Org B. A requests its ID; verify status 3 and denied scoped
   data. B approves; verify Member role and active access. Exercise decline too.
5. Disable an active Member, verify next canonical request rejects access and
   refresh removes the organisation. Test Member management denial, cross-org
   substitutions and stale actions.
6. Refresh, logout/login and use a fresh session; verify persistence and unchanged
   Demo access. Check dashboard/logs/devices/reports with zero resources.

No Site/device/gateway/event/alarm creation is needed. Live GCP acceptance and
deployment remain separate from disposable PostgreSQL test evidence.
