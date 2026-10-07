# Canonical user lifecycle and My Account

Implementation base: `ba965b21b7b928917b3ac14e777efd45677c70d1`.
The matching remote PR base is `feature/self-service-organisations`.
No live GCP, PostgreSQL or Postmark changes were made during implementation.

## Architecture and contracts

`public.users` is the production authority. `api/user_lifecycle.py` owns HTTP
contracts/cookies, `services/user_lifecycle.py` owns the bounded state machines,
`user_lifecycle_repository.py` owns parameterized transactions and row/advisory
locks, and `passwords.py` supplies the shared Argon2 policy. Blocking database,
hashing and email operations use synchronous FastAPI routes. There are no JSON
dual writes, runtime migrations, or database-failure fallbacks.

Signup preserves Create Account → Postmark code → Verify Email → Login. The
canonical row is inserted atomically with challenge consumption after successful
verification. Its username is the entered username, phone is optional, status is
enabled, and there are no organisation/membership inserts. Case-insensitive unique
indexes plus advisory locks prevent duplicates and ambiguous cross-column login
identifiers, including concurrent completions. The existing JSON wire field
`name` now consistently represents the canonical username; this avoids changing
other Portal consumers. User IDs remain decimal strings in API responses.

Reset preserves the code/new-password journey. Unknown and disabled emails get
the same acknowledgement and no email. Provider failures also get that generic
acknowledgement, retain any pending challenge, and log a safe operational event;
resend is recoverable without revealing account eligibility. Signup/unlock
delivery failures return `502` while preserving their challenge cookie. Signup
opens Verify Email with a warning and resend; internal/admin notification failure
is handled only after commit and cannot invalidate a verified user.

My Account preserves editable username, optional phone add/edit/remove,
read-only email and password changes. Editing requires current canonical
password plus Postmark code, followed by a five-minute session-bound unlock.
The unlock authorizes normal edits until expiry; a password change consumes it.
Account version checks reject stale writes with a recoverable reload action.
The shared authenticated shell refreshes immediately after successful edits.
The two cards, inline controls, password visibility, loading/error/success states,
responsive layout and focus-trapped dialog reuse existing Settings/access UI.

Passwords keep the existing minimum of eight characters, preserve whitespace,
and use Argon2 for signup/reset/change/login. The 1,024-character upper bound
limits request/hash cost. No new visible password complexity policy is imposed.

## Temporary state and session safety

Challenges are independent per browser request, not overwritten by email.
Only SHA-256 digests of random handles/grants and secret-keyed HMAC code digests
are stored. Pending signup payloads contain an Argon2 hash, never plaintext
passwords. Cookies are HttpOnly, SameSite Strict and Secure in production;
reset grants stay in cookies, never URLs or JavaScript. Unlock grants are kept in
component memory and bound to the canonical session cookie digest and user.
Lifecycle responses, including validation errors, have `Cache-Control: no-store`;
validation input is omitted so passwords/codes are not echoed back.

Codes last 15 minutes within a one-hour challenge. There are five total wrong
attempts and five resends with a 30-second cooldown; resend never replenishes
attempts. Verification consumes the code. Reset grants last ten minutes from
verification and are independently expiring and one-time usable. Row locks make
completion atomic across instances. Password changes/reset increment
`session_version`; every protected canonical request compares its signed version
with PostgreSQL, revoking old sessions and other pending reset/unlock grants.
Account password change rotates the current browser cookie; reset requires login.
The existing 365-day absolute session lifetime is preserved.

Durable shared rate budgets bound starts (10/email/purpose/hour and
300/client/purpose/hour), login (30/identifier/hour), unlock password checks
(10/user/hour), account writes (60/user/hour) and reset completion
(10/hashed-handle/hour). Budget keys are HMACs. Attempt/budget failures commit
their counters before HTTP errors are raised. Invalid reset grants are rejected
before password hashing. Mutation origin/marker checks reuse the membership
implementation, including its established reverse-proxy handling; all clients
send `X-Requested-With: camOS`. Client addresses follow the deployment's existing
trusted-proxy configuration and can share the client budget behind a proxy.

## Required administrator migration and grants

Review and apply these exact source files yourself against the live database,
using an administrator connection and the actual existing Portal IAM DB role:

```sh
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f backend/migrations/002_canonical_user_lifecycle.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v portal_db_user='ACTUAL_EXISTING_PORTAL_DATABASE_PRINCIPAL' \
  -f backend/migrations/002_canonical_user_lifecycle_grants.sql
```

Migration 001 for organisation memberships remains a separate prerequisite from
the base implementation. Migration 002 is a one-time transaction, with a
five-second lock timeout and 30-second statement timeout. It locks users while
adding a bigint `GENERATED BY DEFAULT AS IDENTITY`; its sequence is initialized
once from existing IDs under that lock, preserving users 0 and 1. Runtime signup
omits the ID and uses `RETURNING`; it never allocates `MAX(id)+1`. Unexpected
existing ID generation causes the migration to fail for administrator review.
Duplicate identifiers, unexpected same-named unique indexes, or incompatible
schema also fail instead of silently changing production assumptions. The
migration is intentionally not rerunnable.

Added schema:

| Object | Purpose |
| --- | --- |
| users ID identity/sequence | Concurrent database-generated IDs |
| users email/username unique indexes | Canonical case-insensitive uniqueness |
| users.session_version | Password-triggered cookie/grant revocation |
| users.account_version | Optimistic account-edit conflict detection |
| users.document_owner_key + unique index | Immutable document ownership through username edits |
| user_lifecycle_challenges | Hashed codes/grants, deadlines, counters, scoped user/session state |
| user_lifecycle_limits | Durable shared request budgets |

Historical document metadata uses username as `accountId`. The migration
backfills each existing user's immutable owner key to that username. New users
get random `canonical:` keys; document endpoints derive the key from the canonical
session, so renaming and later reusing the old username neither loses documents
nor transfers them to another user. Existing metadata and blobs are not moved.

Exact new runtime privileges are SELECT on users; INSERT only on email,
username, phone_number, password_hash, status and document_owner_key; UPDATE only
on username, phone_number, password_hash, session_version and account_version;
USAGE on the actual generated ID sequence; SELECT/INSERT/UPDATE on the two
lifecycle tables. No user deletion, existing status changes, document-owner
updates, lifecycle DELETE or DDL is needed. Existing membership/device grants
remain separate. Additive grants cannot narrow any broader privileges already
assigned to the production role; inspect its current grants separately.

Coordinate schema/grants before deploying the matching frontend/backend. Retire
old revisions handling JSON lifecycle writes. The new cookie format requires
one sign-in after deployment; in-flight old JSON challenges must restart.
Do not roll back to a JSON-writing revision after canonical accounts are created.
The additive schema can remain if application traffic is paused during rollback.
Keep `PORTAL_SESSION_SECRET` stable across instances (minimum 32 characters).
Continue using existing Postmark/runtime variables from `backend/ENVIRONMENT.md`.

Expired rows are inert but require periodic administrator maintenance to bound
storage. The runtime deliberately has no DELETE privilege. For example, use an
existing administrator maintenance process to delete challenges more than one
day past both challenge/grant expiry and limits older than two days:

```sql
DELETE FROM public.user_lifecycle_challenges
 WHERE greatest(expires_at, coalesce(grant_expires_at, expires_at))
       < now() - interval '1 day';
DELETE FROM public.user_lifecycle_limits
 WHERE window_started_at < now() - interval '2 days';
```

## Legacy removal and boundaries

Removed from `api/auth.py`: JSON signup/create-account logic, JSON signup
verification/resend, JSON reset code/grant/password writes, JSON account unlock
and PUT-me writes, and legacy password/challenge helpers. These routes now live
in the canonical module. `/api/create-account` and the obsolete
`/api/password-reset/verify` explicitly return `410`. Removed unused frontend
`createAccount.ts`/`passwordResetVerify.ts`, the placeholder settings password
writer, JSON pending signup/reset/unlock load/save helpers and their configuration
paths, and old opaque session helpers.

Legacy HTTP Basic/admin and chart Basic authentication otherwise accepted stale
JSON passwords after canonical password reset. Those password paths are now
disabled by default, always disabled in production, and available only with an
explicit non-production `PORTAL_LEGACY_PASSWORD_AUTH=true` opt-in. The old
PBKDF2/plaintext verifiers and JSON user loader remain for that isolated
compatibility path. View-token user mappings in `auth_context.py`, admin support
code, demo/file-backed analytics, contact and interest storage remain outside
this lifecycle change. View-token policy is not redesigned or silently claimed
to use canonical lifecycle revocation. Old JSON users/challenge files are not
imported or automatically deleted. No production lifecycle routes access them.

Organisation/membership/site/analytics logic is unchanged. The organisation
browser test only adds the required login header; its fixtures gain the canonical
lifecycle service/schema. CI adds scoped account typechecking and the new real
browser acceptance suite.

## Automated verification

`backend/tests/test_user_lifecycle.py` adds 27 real disposable-PostgreSQL cases
covering canonical signup, identifiers, Argon2/whitespace, IDs 0/1, zero memberships,
wrong/expired/resend/replayed/concurrent verification, provider/admin failures,
generic unknown/disabled recovery, reset/grant expiry and parallel reset,
session revocation, account edits/read-only email/stale conflicts, unlock binding,
historical document ownership and username reuse, cross-site/no-store/validation
handling, retired routes and production legacy-password isolation. A restricted
DB role executes the exact grant source and proves the lifecycle works while
DDL, status/owner updates and deletion remain forbidden. Migrated API paths run
with JSON user load/save patched to fail.

`frontend/scripts/account-lifecycle-browser.mjs` drives real Chromium against
the test PostgreSQL API and a local HTTP Postmark stub. It checks browser signup,
verification/Login feedback, zero organisations, unlock and account edits,
shell refresh, optional phone add/remove, desktop/mobile overflow/screenshots,
password/session revocation, reset with no URL token, email login and dialog focus.
`backend/tests/run_lifecycle_browser.py` hosts that disposable test runtime; its
fake email content stays in temporary test files. Browser scripts accept an
optional `PORTAL_BROWSER_EXECUTABLE` for the already installed local Chromium.

Run with Python dependencies from `backend/requirements-dev.txt`, `npm ci`,
Vite on port 3000 and a disposable localhost PostgreSQL server:

```sh
PORTAL_TEST_POSTGRES_PORT=55432 .venv/bin/python -m pytest -q backend/tests
cd frontend
npm run typecheck:account
npm run build
npm run test:phase-c
npm run test:reports-engine
npm run verify:phone-countries
PORTAL_TEST_POSTGRES_PORT=55432 PORTAL_TEST_PYTHON=../.venv/bin/python \
  PORTAL_BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:account-lifecycle
```

All PostgreSQL proofs here use PostgreSQL 17 locally; CI uses PostgreSQL 16.
Real Cloud SQL/IAM grants, live Postmark delivery and production proxy behavior
remain manual acceptance work, not claimed by the local stub checks.

## Live acceptance after review

Apply reviewed migration/grants and deploy the matched revision. Create a new
browser account, receive the real Postmark code and verify; inspect its canonical
row and zero memberships. Login separately with username/email; exercise existing
create organisation, accept invitation and request-access workflows. Reset through
Postmark, confirm the old password fails, new password works and an existing
session fails. Unlock My Account with current password/code; change username,
add/edit/remove phone and change password; inspect PostgreSQL, navigate, refresh
and logout/login. Confirm historical documents stay with their original user,
email is read-only, expired/replayed codes fail, disabled recovery cannot enable
the user, and an internal admin notification failure does not undo verification.
