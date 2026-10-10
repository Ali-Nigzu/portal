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
| Browser mount, router and access-state redirects | `frontend/src/main.tsx`, `app/routes.tsx` |
| Feature pages, transports and domain projections | `frontend/src/features/` |
| Shared presentation | `frontend/src/common/components/`, `components/`, `styles/` |
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

## Landing and supported aliases

Landing requests the public canonical Demo Organisation 1 snapshot once for its
five scalar cards. `projectLandingScalars` shares canonical calculation with the
Dashboard, retaining Landing's titles, order, formatting and token colours.
The topology and decorative 68% Capacity remain Landing presentation.

Two unresolved identity mappings remain isolated in
`frontend/src/features/organisation-dashboard/compatibility.ts` and
`backend/app/compatibility`: Landing's Main/Delivery/Back traffic channels and
customer `/sites/:siteId/dashboard` aliases. Those aliases deliberately display
zero values; they contain no canonical organisation identity. Their zero
projection is separate from canonical natural empty-state snapshots. Neither
source can authenticate a customer/Admin or feed canonical Portal, Demo or
Reports. The sole retained HTTP contract is GET `/api/snapshots/latest`.

A nonempty `view_token` on a supported Dashboard alias retains its existing
rejection text/shell locally and makes no data request. No token issuer exists.
Canonical authentication never interprets these rejected tokens.

## Resource lifecycle

One PostgreSQL pool is shared by canonical repositories. Metadata reads reuse one
checkout without changing the existing independent read semantics. Transactions
own commit/rollback/reset and invalidate broken connections. BigQuery and GCS
clients initialize lazily; overlapping BigQuery initialization is synchronized.
Shutdown attempts to close GCS, PostgreSQL and BigQuery in order, then propagates
the first failure. Startup performs lifecycle cleanup and a bounded BigQuery
connectivity check. No DDL or migration runs at startup.

## Organisations, scope and natural empty states

A canonical user may have zero memberships. An organisation owns Sites, each
Site owns Devices and may have a Gateway. A newly created organisation may own
zero Sites: the same normal Portal presents its existing zero Dashboard and
empty Events/Alarms/Devices/Reports states. Adding a Site makes it available in
the same organisation and Portal. A Site may similarly have zero Devices.
There is no fabricated zero-account application or empty-state mode.

Disabled Sites remain present in relational context. Site Realtime means at
least one Device has `analyzed_until >= database_now - 15 minutes`; equality
qualifies, null/no Devices does not. Organisation Realtime is any owned Site's
Realtime value. ON/OFF is independently the selected entity's `enabled` flag.
Snapshot timestamps and Gateway status do not determine these two header states.
Context status changes on normal context fetch, not a browser polling cache.

Portal selection belongs to the route/context. Scope changes abort obsolete
requests, remount module state and reset filters/cursors. Customer scope comes
from current membership; Demo's public adapter fixes its identity. User-scoped
favourites/recent destinations in browser storage never authorize access.

## Memberships and organisation management

Organisation creation makes the session user an active Owner. Invitations and
requests always assign Member server-side and never create user accounts.
Ordinary Portal access requires active membership and an enabled organisation;
Owner and Member have the same ordinary organisation-wide Portal visibility.
Owners additionally manage the roster, invitations, decisions and disabling.

Statuses are Disabled, Active, Invited and Requested. Repeated pending submissions
or already-completed decisions are harmless 200 responses without new writes or
timestamps. Incompatible/stale transitions conflict. Decision bodies carry the
displayed nullable `status_changed_at`, preventing stale decisions from changing
a newer relationship. Disabled membership can later be invited/requested again.

Personal actions target the session user. Management checks current active Owner
authority. Unrelated scopes are concealed with 404; active Members receive 403
for management. Self-invite/self-disable and disabling the last active Owner are
rejected. The UI provides no ownership transfer/role editor.

Delete Organisation is soft deletion: an Owner-confirmed transaction rechecks
user, organisation, active membership and role under the organisation lock and
sets only `organisations.enabled=false`. Related rows/snapshots remain intact.
Other customers immediately lose normal access; Admin may re-enable the row.

## Customer lifecycle and account

Signup normalizes email, validates identifiers/phone and preserves password bytes.
Verification rechecks identifier uniqueness, inserts the user and deletes the
challenge atomically. User creation grants no memberships. Admin notification
failure after creation cannot invalidate successful verification.

Reset acknowledges eligible/ineligible/temporarily undeliverable accounts
generically. A verified reset updates the Argon2 hash, increments session version
and removes reset/unlock challenges atomically. Prior cookies cease to authorize.
Reset returns to Login; password change replaces the current browser cookie.

Account unlock requires current customer session, password and Postmark code.
The verified challenge authorizes edits for five minutes. Username/phone/password
remain editable under existing rules; email is read-only. Removing phone writes
NULL. Lock editing/logout end the current unlock; password changes invalidate
that user's reset/unlock challenges. Existing-user operations lock the user
before its challenge; identifier locks preserve cross-column login uniqueness.

## Dashboard and snapshots

Canonical Dashboard selects the organisation/site PostgreSQL snapshot. Missing
or unusable payloads use the existing transient zero projection where the
authorised scope contract permits it. Real relational identity and traffic entity
names remain present in that projection; it is never persisted. No synthetic
customer, organisation or Site is inserted to produce an empty state.

The shared projection preserves rolling buckets, occupancy average/minimum/
maximum, capacity, traffic shares and selected rollup periods. Header freshness,
clock, Dwell presentation, series colors, tooltips and animation remain their
existing product policies. Dashboard and Reports intentionally differ in
validation/fallback and must not share a looser parser by accident.

## Events, Alarms and Devices/Gateways

Events use scoped BigQuery queries, exact filters, descending timestamp/ID cursor
paging and a bounded full-result CSV export. Initial total and subsequent page
reads retain their current observation boundaries. Source/enum validation and
formula-injection escaping remain runtime functionality.

Alarms read canonical PostgreSQL with bulk joins. Initial read-only repeatable-read
transactions return counts, active rows and ten newest cleared rows. Cleared
continuations append ten and read an extra row to detect another page. Counts
do not depend on loaded pages. More than 1,000 active rows requires narrower
filters. Active/cleared lifecycle is solely `cleared_at` nullability, including
Demo cutoff behavior.

Device list combines canonical relational state with Event-derived counts.
Device runtime status and Gateway activity use the existing inclusive 15-minute
boundary. Enabled configuration and online/offline activity are independent.
Gateway desired state maps unknown/Off/On to 0/1/2; boolean controls write only
1/2. Restart and enabled controls retain current permissions, SQL targets,
transaction semantics and response shapes. Demo keeps its deliberate public
control transformation instead of exposing customer write authority.

## Reports

Reports use one selected canonical snapshot, scope identity and effective clock.
ReportsSnapshot parsing validates all required rollups before calculation.
Periods are Today, Yesterday, Last Week, Last Month, Last Quarter, Last Year and
All Time, mapped to the stored today/yesterday/week/month/quarter/year/all_time
rollups. Site Activity and Visitor Profile retain their separate calculations.

Totals sum the selected series; occupancy/dwell statistics and rounding remain
owned by `ReportsEngine.ts`. No new averaging, rebucketing or time-zone rule is
introduced. Demographic percentages, period comparisons, charts, table ordering,
PDF text/layout/filename and download behavior are stable. An unchanged parent
render reuses its current report calculation without freezing advancing clocks.

Customer Reports retain the allowed missing-snapshot empty projection; strict
Demo Reports preserve not-found/invalid errors. A Dashboard fallback must not
silently relax the strict Reports contract.

## Documents and Contact

Documents belong to the canonical user, independently of organisation membership.
The page lists/uploads/downloads/deletes the authenticated user's GCS objects.
Each upload is validated against the 25 MiB limit before storage writes using
the existing request spool. Accepted files and per-file failures retain their
batch ordering/representation. Duplicate names do not overwrite. Download
preflights its first storage read before returning success and closes the stream
on completion/cancellation. Delete uses the observed generation.

Contact accepts up to three attachments, each at most 10 MiB, with the current
extension/content-type rules. It validates fields, saves the atomic JSON journal,
notifies Admin, then confirms to the customer. Persistence failure returns 500
before mail; configuration/delivery errors retain 503/502 behavior. Saved records
survive delivery failure. Contact is public product functionality, not legacy
authentication or organisation authority.

## Demo and Admin

View Demo uses the normal Portal components and canonical domain services with
the deliberate fixed public organisation and relational Site selection. Bare
entry Site 2, old aliases, slug collisions, cutoff clock and public control
transformations retain their existing semantics. Old positional preview clock
values preserve wall-clock components rather than gaining UTC conversion.

Admin uses the same PostgreSQL rows through a fixed ten-table registry. Typed
create/update preserves bigint/numeric precision, UUIDs, JSONB and enum checks.
No client-supplied schema, identifiers or writable column names are trusted.
Primary keys remain immutable. Admin authorization stays separate from every
customer journey while sharing the application and deployment.
