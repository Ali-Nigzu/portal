# Portal development and validation

One production entrypoint composes PostgreSQL, BigQuery, GCS and Postmark:
`python -m uvicorn backend.fastapi_app:app --host 0.0.0.0 --port 8080`.
Use the existing isolated task checkout; do not create a worktree unless requested.
Production startup performs lifecycle cleanup and a BigQuery check. Do not point
local regression runners at production or run migrations/grants there.

Install Python >=3.11 with `python -m venv .venv`, then
`.venv/bin/python -m pip install -r backend/requirements-dev.txt`.
From `frontend`, use `npm ci` and `npm run dev`. Node 20 is the container build
runtime; CI uses Node 22. Use a writable npm cache if the default home is read-only.

For explicit isolated zero-site development, from the repository root run:

```sh
PORTAL_SESSION_SECRET=isolated-development-session-secret-only \
  .venv/bin/python -m backend.dev.run_fixture_portal
```

This runner injects fixture services from `backend/tests/support`; it does not
change production composition. It is refused under `NODE_ENV=production`.
The fixture is `backend/tests/fixtures/local_new_account.json`; its known test
login is fixture-only. It does not provide lifecycle/membership mutations or Admin.
Production has no backend-mode selector. Test/dev code is excluded by `.dockerignore`.

Regression databases must be disposable localhost PostgreSQL servers:

```sh
PORTAL_TEST_POSTGRES_PORT=5432 .venv/bin/python -m pytest -q backend/tests
```

These tests create/drop uniquely named local databases and roles. The port variable
is a test-only binding; it never controls production Cloud SQL.
Install Chromium using Playwright or set `PORTAL_BROWSER_EXECUTABLE` to an existing
Chromium executable. Use `PORTAL_TEST_PYTHON` to select the virtualenv Python for
browser runners, and export `PORTAL_TEST_POSTGRES_PORT` for database-backed journeys.
From `frontend`, run the existing type checks, phase-C/Reports tests, production
build and browser scripts. Build copies generated output to `backend/frontend_build`.
Use `/api/me` returning 401 as fixture readiness, not `/docs` (disabled in production).

See [compatibility-surface.md](compatibility-surface.md) for the exhaustive retained
historical API/data boundary. Do not use it to provision canonical users or Admin.
