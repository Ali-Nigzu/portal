# camOS architecture

camOS is one React SPA and one FastAPI application, packaged in one container.
`Dockerfile` builds the SPA with Vite and copies it to `backend/frontend_build`.
Uvicorn imports `backend.fastapi_app:app`, which calls `create_app()` once.
The same application registers customer, public Demo and restricted Admin APIs
and serves the SPA, assets and browser deep links. There is no application mode
selector, fixture composition or alternate launcher.

## Ownership

| Area | Owner |
| --- | --- |
| Browser mount, router and access-state redirects | `frontend/src/main.tsx`, `app/App.tsx`, `app/routes.tsx` |
| Feature pages, transports and domain projections | `frontend/src/features/` |
| Shared presentation and cancellation | `frontend/src/common/`, `components/`, `styles/` |
| Customer identity/catalogue projection | `AuthenticatedApplicationContext` |
| Selected Portal identity, sources, scope and clock | `PortalContext` |
| Dashboard snapshot observation | `OrganisationDashboardProvider` |
| HTTP validation, guards and response contracts | `backend/app/api/` |
| Business rules and authorised projections | `backend/app/services/` |
| Cloud SQL pooling/transactions | `DashboardPostgres` |
| Documents storage contract and provider | `backend/app/data/` |
| Runtime composition and resource ownership | `backend/app/app_factory.py` |

PostgreSQL owns users, memberships, organisations, sites, devices, gateways,
snapshots, alarms and lifecycle challenges. BigQuery owns Events and Event-derived
counts. GCS owns private Documents; Postmark delivers product email.
Browser storage and React state are projections, never membership or user authority.

## Routes

| Browser route | Contract |
| --- | --- |
| `/` | Redirect to `/home` |
| `/home` | Public Landing or authenticated customer Home |
| `/login`, `/create-account`, `/verify-email` | Public customer authentication; authenticated redirect to Home |
| `/reset-password`, `/reset-password/code`, `/reset-password/new` | Public recovery journey; authenticated redirect to Home |
| `/contact` | Current Contact page in public and customer states |
| `/terms-and-conditions`, `/privacy-policy`, `/sub-processor-register` | Public legal pages; authenticated redirect to Home |
| `/documents` | Canonical private customer Documents; unauthenticated redirect to Login |
| `/settings` | Redirect to `/settings/account` |
| `/settings/account`, `/settings/access` | Customer account and organisation access |
| `/settings/alarms` | Existing redirect to Account |
| `/sites/organisations/:organisationId/:module` | Authorised organisation Portal |
| `/sites/organisations/:organisationId/sites/:siteId/:module` | Authorised site Portal |
| `/demo`, `/demo/:organisationSlug/:module`, `/demo/:organisationSlug/:siteSlug/:module` | Public product Demo |
| `/dashboard`, `/sites`, `/sites/:siteId` and their module paths | Existing alias/redirect/older-link interpretation |
| `/admin` and descendants | Restricted Admin inside this SPA |
| Unmatched route | Access-state-dependent redirect defined by the router |

Portal modules are `dashboard`, `event-logs`, `alarm-logs`, `device-list` and
`reports`. Page imports remain lazy. Query preservation, selected-site storage,
Demo aliases and redirect replacement semantics belong to `app/routes.tsx`.
Feature composition must preserve stylesheet evaluation order, DOM classes,
responsive geometry and accessibility. Shared rail geometry comes from product
design tokens and layout styles; secondary scrolling belongs to its bounded list.

## Security boundaries

Customer sessions use `camos_session`, a signed, absolute-expiry, 365-day token
containing canonical user identity and `session_version`. Protected requests
reload the enabled PostgreSQL user and compare the current version. Portal
requests independently revalidate enabled organisations and active memberships.
Roles/membership claims are not trusted from cookies or browser state.

Admin is intentionally absent from customer navigation. Its API accepts only
enabled canonical user ID `999999`; the username comes from PostgreSQL.
`camos_admin_session` has a separate signing purpose and eight-hour lifetime.
Customer login/session/reset/unlock reject that reserved identity. Customer and
Admin cookies cannot authenticate each other's routes. Admin remains part of the
same application, build, deployment and database.

Mutation-origin checks, request markers, no-store responses, typed payloads,
parameterised SQL, closed identifier allowlists and generation guards remain
runtime behavior. Session secrets and cookie settings are described in
[deployment.md](deployment.md).

## Portal and Demo composition

Customer and Demo adapters use the same Portal context, module components and
canonical backend domain services. A scope change remounts module state, resets
filters/cursors and aborts obsolete requests. Responses are checked against the
selected scope. Dashboard and Portal providers retain their distinct observation
boundaries; they must not be collapsed into a freshness-changing cache.

Public Demo deliberately fixes organisation ID `1`; bare `/demo` selects owned
Site ID `2`. Name slugs come from relational context, with deterministic hash
suffixes for normalization collisions. Missing configured Site 2 produces the
existing retryable configuration error. Demo control transformations remain
product adapters and do not authorize customer writes.

## Retained preview and older-link contract

Landing's visible system preview and older Dashboard URLs still consume these
three HTTP contracts:

| Method | Path | Responsibility |
| --- | --- | --- |
| GET | `/api/dashboards/{dashboard_id}` | Current manifest/spec response |
| DELETE | `/api/dashboards/{dashboard_id}/widgets/{widget_id}` | Existing process-local widget mutation |
| GET | `/api/snapshots/latest` | Positional snapshot/source/fallback response |

Their implementation is isolated under `backend/app/compatibility`. Canonical
customer/Admin authentication, memberships, Documents and Portal domain services
do not import it. Historical JSON users, password formats, alarm/device journals,
interest submission APIs and token issuance/storage are absent. Supplied view
tokens retain the existing `401 Invalid or expired view token` response; there
is no token issuer in this application.

These live preview/snapshot contracts use different payload, identity and source
semantics from canonical PostgreSQL snapshots, including SQLite/BigQuery/JSON
fallback behavior. They remain isolated to preserve current output and failure
behavior. They cannot replace canonical services or create alternate identity
authority. Exact data/source semantics are in [data-contracts.md](data-contracts.md).

## Resource lifecycle

One PostgreSQL pool is shared by canonical repositories. Metadata reads reuse one
checkout without changing the existing independent read semantics. Transactions
own commit/rollback/reset and invalidate broken connections. BigQuery and GCS
clients initialize lazily; overlapping BigQuery initialization is synchronized.
Shutdown attempts to close GCS, PostgreSQL and BigQuery in order, then propagates
the first failure. Startup performs lifecycle cleanup and a bounded BigQuery
connectivity check. No DDL or migration runs at startup.
