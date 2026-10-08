# Retained compatibility surface

This is the complete retained compatibility surface after production consolidation.
It exists to preserve exposed contracts whose external non-use cannot be proven.
It cannot authenticate a canonical customer or Admin session, create canonical
users or memberships, or replace an app.state canonical service.

| Method | URL | Retained contract |
| --- | --- | --- |
| GET | `/api/alarm-logs` | Historical JSON client alarms |
| GET | `/api/device-list` | Historical JSON devices and data-source mappings |
| GET | `/api/snapshots/latest` | Historical positional snapshots, SQLite/BigQuery/JSON fallback and strict-site behavior |
| GET | `/api/dashboards/{dashboard_id}` | Historical manifest |
| DELETE | `/api/dashboards/{dashboard_id}/widgets/{widget_id}` | Existing manifest mutation |
| POST | `/api/register-interest` | Existing interest JSON journal and acknowledgement |
| GET | `/api/search-events` | Existing 410 retirement response |
| POST | `/api/create-account` | Existing 410 retirement response |
| POST | `/api/password-reset/verify` | Existing 410 retirement response |

All live historical implementations are under `backend/app/compatibility`.
The two lifecycle tombstones stay in the lifecycle router solely to preserve
its response/error headers. Neither provides identity creation or reset.
The application factory registers compatibility routers, but no canonical domain
service or customer/Admin authentication module imports their implementations.

The frontend still preserves `/dashboard`, `/sites`, `/sites/:siteId` and the
Dashboard/Event/Alarm/Device/Reports deep links beneath it, view-token query
handling, and the existing Demo redirects. They are URL compatibility within the
same application, not a second customer or Admin product. Dashboard's historical
manifest/widget transports remain reachable here; their errors and loading states
are frozen. Current scoped Portal transports use `/api/portal/organisations/...`
or the product Demo adapters `/api/demo/...` instead.

Historical JSON paths remain `backend/data/users.json`, `alarm_logs.json`, and
`device_lists.json`; their existing reads, default-record creation and upgrades
remain confined to compatibility requests. These records never enter canonical
login, lifecycle, membership, Documents ownership, or Admin authentication.
Legacy Basic password support remains explicitly non-production only, with its
existing `PORTAL_LEGACY_PASSWORD_AUTH` opt-in and production 410 response.
The in-memory view-token validator has no token issuer in this application;
no Admin view-token creation path is added.

`backend/data/demo_snapshot.json` and the three configured SQLite snapshot paths
remain only because the exposed compatibility snapshot contract reads them.
Canonical organisation/site snapshots and Reports use PostgreSQL exclusively.
The unused combined-log DB path and old log archives are removed.

Contact Us is current product behavior, not this compatibility surface.
Its JSON journaling, atomic replacement, validation, persistence-before-email
ordering, error responses, and Postmark calls remain unchanged.
The interest journal is retained independently of the dead frontend form hook.

Retirement requires separate evidence/approval of the affected external contract.
Do not introduce fallbacks from canonical services into this package.
