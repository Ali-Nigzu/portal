# camOS data contracts

The application reads the existing production schema. The Admin registry in
`backend/app/services/admin_registry.py` is the executable field/type allowlist;
it is not a schema migration. Inspect actual columns, constraints, indexes and effective privileges with
read-only PostgreSQL queries before deployment.

## PostgreSQL

| Table | Primary key | Relationships and purpose |
| --- | --- | --- |
| `users` | `id` bigint identity | Canonical email, profile username, optional Argon2 credential, enabled status and session version |
| `organisations` | `id` bigint identity | Named organisation, timestamps and enabled state |
| `sites` | `id` bigint identity | `organisation_id`, name, maximum capacity, enabled state and timestamps |
| `devices` | `id` bigint identity | `site_id`, enabled/analysis/capture configuration and activity timestamps |
| `gateways` | `gateway_id` UUID | Nullable `site_id`, desired state, restart/activity/version/commission fields |
| `memberships` | `(user_id, organisation_id)` | User-to-organisation role/status and transition timestamps |
| `organisation_snapshots` | `organisation_id` | `ts`, object `payload`, internal `state`, `updated_at` |
| `site_snapshots` | `site_id` | `ts`, object `payload`, internal `state`, `updated_at` |
| `alarms` | `id` bigint identity | Organisation/site, optional Device/Gateway, type/severity/start/clear timestamps |
| `user_auth_identities` | `id` bigint identity | Stable Google/Microsoft identity mapping to canonical user |
| `user_lifecycle_challenges` | `id` text | Temporary signup/reset/unlock challenge and nullable canonical user reference |

Bigint identities are serialized as lossless decimal strings in browser/API
identity fields. PostgreSQL identifier validation accepts positive decimal
values through `9223372036854775807`, never JavaScript-rounded numbers.
Gateway identities are UUIDs. Canonical timestamps are timezone-aware and
serialized as ISO UTC. Admin preserves exact JSON numeric lexemes, decimal
values and bytea representation through its typed row contract.

| Field | Closed values |
| --- | --- |
| `users.status` | `0` Disabled, `1` Enabled |
| `memberships.role` | `0` Owner, `1` Member |
| `memberships.status` | `0` Disabled, `1` Active, `2` Invited, `3` Requested |
| `gateways.desired_state` | `0` unknown/unassigned, `1` Off, `2` On |
| `alarms.severity` | `low`, `medium`, `high` |
| Challenge `purpose` | `0` Signup, `1` Reset, `2` Unlock |

Unknown persisted Gateway state is an error, not silently coerced to On/Off.
`session_version` is a nonnegative bigint. Memberships have one row per user and
organisation; pending statuses require `status_changed_at`. Original
`created_at` survives later membership transitions.

Users require the case-insensitive unique index `uq_users_email_ci` on
`lower(email)` and a BY DEFAULT identity sequence. `username` is required,
editable, non-unique profile data. `password_hash` is nullable: NULL means no
camOS password; a populated hash enables password authentication. Signup explicitly supplies
`created_at`; that column does not need a database default. Devices require
positive analysis and frame-package intervals. Admin primary keys are immutable.
Table names, writable columns and filters come only from the static registry.

## Authentication contracts

Customer password login is strictly `POST /api/login {email,password}`; recovery
starts with `POST /api/password-reset/start {email}`. Username and identifier
request shapes are rejected. Customer user DTOs include `has_password`, derived
only from hash presence; hashes and provider subjects never appear in these DTOs.

`user_auth_identities` has `user_id` referencing users with ON DELETE CASCADE,
`provider` smallint (`0` Google, `1` Microsoft), non-null `issuer` and `subject`,
and creation timestamp. Its existing constraints are CHECK provider IN (0,1),
UNIQUE(provider,issuer,subject), and UNIQUE(user_id,provider). Mappings are
immutable in v1; only SELECT/INSERT are used. No OAuth tokens or codes are stored.

Known provider identities resolve by provider/issuer/subject, not email. Unknown
identities from Login never create accounts. Google Signup requires a validated
verified email and creates the user/mapping atomically. New Microsoft Signup
uses the suggested mailbox only after the existing camOS code proves ownership;
its user/mapping are then created atomically. Both use NULL password and phone,
status 1, and a seeded non-unique name. Subsequent provider logins never sync profiles.

An unknown provider matching an existing password account requires that camOS
password before inserting a mapping. A matching passwordless account requires
its existing connected provider; anonymous second-provider attachment is denied.
Passwordless Login/Reset returns a provider-aware result. Reset never creates a
first password, including through stale reset challenges. An authenticated
passwordless user unlocks settings with the existing email code and may set their
first password through PUT /api/me; normal version increment/invalidation applies.

Username invitations resolve zero/one/multiple candidates. Multiple matches
return only "Please use the user's email address." and never select a recipient.
Admin username lookup is constrained to ID 999999; Admin sessions remain separate.

## Lifecycle challenge records

Columns are `id`, `purpose`, `user_id`, `payload`, `code_hash`,
`code_expires_at`, `attempts`, `resends`, `last_sent_at`, `verified_at`,
`consumed_at`, `created_at`. Incoming opaque random handles are SHA-256-digested
for lookup. Codes are HMAC-digested with the session secret; plaintext codes are
not stored. Signup payload holds normalized email, username, optional phone and
Argon2 password hash. Microsoft pending signup instead stores a NULL hash,
NULL phone, and the already-validated stable provider identity in the same
purpose-0 payload; no provider tokens are retained. Reset/unlock payloads are empty and reference a current user.

Pending challenges last one hour, codes 15 minutes, with five wrong attempts,
five resends and a 30-second resend cooldown. Verified reset authorization lasts
ten minutes; verified account unlock lasts five minutes. Verification consumes
the same challenge row/handle, not a second credential authority.

## Canonical snapshots

The HTTP selected snapshot is:

```text
{ scope: "organisation" | "site", entity_id: decimal-string,
  entity_name: string, ts: timezone-aware-ISO, payload: object }
```

Reports wraps this in `{scope: {organisation_id, site_id}, snapshot}`.
The object payload contains:

| Field | Shape |
| --- | --- |
| `entrances_96`, `exits_96`, `footfall_96`, `dwell_time_96` | 96 finite numeric buckets |
| `occupancy_96` | 96 `[average, minimum, maximum]` triples, minimum ≤ average ≤ maximum |
| `capacity` | 96 numeric pairs |
| `traffic_devices` | Named traffic entities carrying `site_id` at organisation scope or `device_id` at site scope |
| `traffic_split_96` | 96 numeric arrays, each matching the traffic entity count |
| `today`, `yesterday`, `week`, `month`, `quarter`, `year`, `all_time` | Rollup objects |
| Rollup `entrances`, `exits` | Numeric arrays |
| Rollup `occupancy` | Average/minimum/maximum triples |
| Rollup `age_pct`, `sex_pct` | Six/two numeric entries; sum is 0 or 100 |

Admin accepts valid JSONB independently of Dashboard usability. `state` remains
an internal snapshot field, never selected into normal Dashboard/Reports DTOs.
Dashboard read-time validation does not introduce freshness limits, capacity
caps or a fixed all-time array length. Reports retains its separate validation
and missing/invalid snapshot behavior.

## BigQuery Events

Canonical Event readers use `camosbase.camos_prod.events`. Required projection
fields are `organisation_id`, `site_id`, `device_id`, `event_id`, `event`,
`timestamp`, `sex`, `age_bucket`. Queries parameterize the authorised scope,
filters, bounds, cursor and limit. Device Event counts use the same authority.

| Numeric value | Meaning |
| --- | --- |
| Event `0`, `1` | Exit, Entrance |
| Sex `0`, `1` | Male, Female |
| Age `0`…`5` | 0–4, 5–13, 14–25, 26–45, 46–65, 66+ |

Events are ordered by timestamp and Event ID descending. Initial total is checked
against distinct non-null Event IDs. Page size defaults to 20 and is capped at
100. Cursors bind selected scope, sources and filters; every continuation still
revalidates authorization. A Gateway filter includes events from its site's
Devices without relabelling Device origin.

CSV uses the same scope/filters/domain labels and permits at most 100,000 rows.
The bounded query retrieves up to 100,001 to reject overflow before streaming;
it never exports only the visible page. Spreadsheet formula prefixes are escaped.

## Documents in GCS

The bucket defaults to `camos-prod-1`. Objects live directly at
`<canonical-user-id>/<safe-filename>`; no organisation/site path or caller-supplied
owner is accepted. IDs are reversible filename identifiers, not cloud URLs.
Document DTOs preserve `id`, `accountId`, `name`, `type`, `mimeType`, `sizeBytes`,
`createdAt` and `updatedAt`.

Allowed kinds are PDF, CSV, XLSX and DOCX. Each file is limited to 25 MiB.
Unsafe names, path separators, nested administrative objects and markers are
rejected or omitted according to the service contract. Create uses a generation
precondition; duplicate names do not overwrite. Download/delete resolve the
authenticated user prefix and use the observed object generation. List ordering
is creation timestamp then filename descending.

## Password reset API

All endpoints retain the current origin/marker safeguards and no-store responses.
`POST /api/password-reset/start` accepts strictly `{email}` and resolves only
case-insensitive canonical email. Enabled password-bearing users receive 202 with
`{ok, expiresInSeconds: 900, resendCooldownSeconds: 30}` and the HttpOnly RESET
cookie. Unknown/ineligible users get the same acknowledgement and a fresh cookie
without account authority; delivery failures remain generic. Enabled passwordless
customers receive 409 `{error:"provider_required",message,providers}` with their
stored provider names, no challenge/email, and a cleared previous RESET cookie.
Disabled accounts and reserved Admin ID 999999 never receive recovery authority.

After start, no browser identity is accepted as recovery authority:

- `/api/password-reset/resend`: POST without a body; returns
  `{ok, expiresInSeconds: 900, resendCooldownSeconds: 30}` generically.
- `/api/password-reset/verify-code`: `{code}`; returns
  `{ok, resetExpiresInSeconds: 600}` after verifying the cookie-bound challenge.
- `/api/password-reset/set-password`: `{password, confirm_password}`; returns `{ok}`.

The challenge's canonical user ID owns mutation. Completion increments session
version and invalidates RESET/UNLOCK challenges atomically. Existing five-attempt,
five-resend, 30-second cooldown and expiry rules remain. Browser routes contain no
identity query parameters. Synchronous provider timing can differ by eligibility.

## Contact persistence

`backend/data/contact_submissions.json` is an active append journal, not user
authority. The visible Organisation (optional) field maps to `company` in multipart
transport, the journal, and the internal email function; its displayed email label
is Organisation. Blank values remain optional. Contact atomically replaces the
journal before delivering the Admin notification and then customer confirmation. Journal failure prevents mail;
mail failure does not roll back the saved submission. Records include attachment
names; email payloads carry attachment contents. This order and failure contract
remain part of the product.

## Landing snapshot projection

| Landing card | Canonical Demo Org 1 field | Formatting |
| --- | --- | --- |
| Entrances | `entrances_96[95]` and its rolling series | Existing numeric headline/sparkline |
| Occupancy | `occupancy_96[95][0]` and bucket averages | Average, never minimum/maximum |
| Exits | `exits_96[95]` and its rolling series | Existing numeric headline/sparkline |
| Footfall | `footfall_96[95]` and its rolling series | Supplied footfall, not a recomputed sum |
| Dwell Minutes | `dwell_time_96[95]` and its rolling series | Existing numeric format, no artificial decimals |
| Traffic Split | `traffic_devices` Site names paired with `traffic_split_96[95]` | Existing donut/legend and percentage formatting |

Scalar projections use the canonical 96 buckets and snapshot time. The fixed 68%
Capacity decoration is independent of snapshot capacity. No scalar fixture value
is retained or manufactured. All six cards use the same canonical Org 1 response;
Landing reads Site names and traffic shares from that response.
