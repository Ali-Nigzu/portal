# Delivery record: canonical lifecycle and My Account

Base: `ba965b21b7b928917b3ac14e777efd45677c70d1`.
Branch: `feat/canonical-user-lifecycle`.
PR target: `feature/self-service-organisations` (currently exactly the requested base).

Architecture, legacy paths, deliberate compatibility changes, exact administrator
migration/grants, rollback considerations, remaining legacy dependencies and live
acceptance are documented in [canonical-user-lifecycle.md](canonical-user-lifecycle.md).
No production database/GCP changes or live email delivery were performed.

## Final results

| Command / check | Result |
| --- | --- |
| `PORTAL_TEST_POSTGRES_PORT=55432 .venv/bin/python -m pytest -q backend/tests` | 255 passed, 7 existing dependency/startup deprecation warnings; 10.36s |
| `backend/tests/test_user_lifecycle.py` | 27 real PostgreSQL cases passed within the full suite |
| Restricted-role grants proof | Exact grant source supports signup/reset/unlock/account writes; DDL, status/owner update and deletion rejected |
| `npm run typecheck:account` | Passed |
| `npm run build` | Passed; 3,037 modules transformed |
| `npm run test:phase-c` | Passed |
| `npm run test:reports-engine` | Passed, including PDF assertions |
| `npm run verify:phone-countries` | Passed, 115 country entries |
| `npm run test:account-lifecycle` | Passed with real API/PostgreSQL and local HTTP Postmark stub; desktop/mobile screenshots inspected |
| `npm run test:organisation-access` | Passed; desktop/phone/tablet, multi-user organisation and existing membership workflows |
| `npm run test:authenticated-shell` | Passed |
| `node scripts/authenticated-ui-polish-browser.mjs` | Passed |
| `node scripts/authenticated-zero-data-browser.mjs` | Passed; 26 scenarios and 112 PDF downloads verified with pdftotext |
| `npm run test:local-new-account` | Passed; isolated read-only fixture journey, logout/login and persisted favourites |
| `npm run typecheck` | Existing baseline failure: 64 diagnostics versus 65 on requested base with identical compiler/config; no added file/error-code diagnostics |
| `npm run test:auth-brand-assets` | Existing missing authenticated logo assertion fails at line 154 on both this revision and untouched base; preceding public auth artwork checks run successfully |
| `git diff --check` | Passed |

Browser commands use `PORTAL_BROWSER_EXECUTABLE=/usr/bin/chromium` (Chromium 151)
and the lifecycle/organisation runners use `PORTAL_TEST_PYTHON` pointing at the
Python 3.12 virtualenv. Local PostgreSQL is version 17 on localhost port 55432;
CI retains PostgreSQL 16. Browser evidence is in ignored
`frontend/test-results/account-lifecycle/{desktop,mobile}.png`. Full backend,
browser, build and baseline-comparison outputs are in `/tmp/portal-*.log` in this
workspace. None of these local checks claims real Postmark or Cloud SQL/IAM proof.

The global typecheck and old brand-logo assertion are recorded limitations;
fixing unrelated analytics typing or restoring an old shell logo would change
frozen scope. Scoped account typechecking and the current shell tests pass.

## Added, changed and removed files

The following manifest is the implementation diff from the exact base. `A` means
added, `M` changed and `D` removed. Generated test documents and brand screenshots
were moved out of the checkout rather than committed.

```text
M	.github/workflows/organisation-access.yml
M	backend/ENVIRONMENT.md
M	backend/app/api/auth.py
M	backend/app/app_factory.py
M	backend/app/auth.py
M	backend/app/config.py
M	backend/app/data/json_store.py
M	backend/app/models.py
M	backend/app/services/auth_context.py
M	backend/app/services/canonical_auth.py
M	backend/app/services/postmark_email.py
M	backend/app/services/session_tokens.py
M	backend/tests/membership_postgres.py
M	backend/tests/run_membership_browser.py
M	backend/tests/test_contact_form.py
M	backend/tests/test_local_new_account.py
M	backend/tests/test_phase_c_auth.py
M	frontend/package-lock.json
M	frontend/package.json
M	frontend/scripts/auth-brand-assets-browser.mjs
M	frontend/scripts/authenticated-shell-browser.mjs
M	frontend/scripts/authenticated-ui-polish-browser.mjs
M	frontend/scripts/authenticated-zero-data-browser.mjs
M	frontend/scripts/local-new-account-browser.mjs
M	frontend/scripts/organisation-access-browser.mjs
M	frontend/src/app/routes.tsx
M	frontend/src/context/AuthenticatedApplicationContext.tsx
M	frontend/src/features/auth/CreateAccountPage.tsx
M	frontend/src/features/auth/LoginPage.tsx
M	frontend/src/features/auth/ResetPasswordPage.tsx
M	frontend/src/features/auth/VerifyEmailPage.tsx
M	frontend/src/features/auth/components/AuthPhoneField.tsx
M	frontend/src/features/auth/hooks/useCreateAccountForm.ts
D	frontend/src/features/auth/transport/createAccount.ts
M	frontend/src/features/auth/transport/login.ts
M	frontend/src/features/auth/transport/me.ts
M	frontend/src/features/auth/transport/passwordResetResend.ts
M	frontend/src/features/auth/transport/passwordResetSetPassword.ts
M	frontend/src/features/auth/transport/passwordResetStart.ts
D	frontend/src/features/auth/transport/passwordResetVerify.ts
M	frontend/src/features/auth/transport/passwordResetVerifyCode.ts
M	frontend/src/features/auth/transport/signupResend.ts
M	frontend/src/features/auth/transport/signupStart.ts
M	frontend/src/features/auth/transport/signupVerify.ts
M	frontend/src/features/settings/api/settingsApi.ts
M	frontend/src/features/settings/components/EditableFieldRow.tsx
M	frontend/src/features/settings/components/ReenterPasswordModal.tsx
M	frontend/src/features/settings/pages/MyAccountPage.tsx
M	frontend/src/features/settings/types.ts
M	frontend/tsconfig.json
A	backend/app/api/user_lifecycle.py
A	backend/app/services/passwords.py
A	backend/app/services/user_lifecycle.py
A	backend/app/services/user_lifecycle_repository.py
A	backend/migrations/002_canonical_user_lifecycle.sql
A	backend/migrations/002_canonical_user_lifecycle_grants.sql
A	backend/tests/run_lifecycle_browser.py
A	backend/tests/test_user_lifecycle.py
A	docs/canonical-user-lifecycle.md
A	frontend/scripts/account-lifecycle-browser.mjs
A	frontend/src/features/settings/MyAccount.css
A	frontend/tsconfig.account.json
A	docs/canonical-user-lifecycle-delivery.md
```

The final implementation commit SHA is supplied in the completion message and
can be read with `git rev-parse HEAD`; this file is part of that commit.
