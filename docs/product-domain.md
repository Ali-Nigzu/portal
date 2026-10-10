# camOS product domain

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

The public Landing system preview and older Dashboard URLs retain their live
manifest/positional-snapshot projection. Its schema/source distinctions are
documented in [data-contracts.md](data-contracts.md); it creates no canonical
identity and cannot become a customer/Admin data fallback.

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
