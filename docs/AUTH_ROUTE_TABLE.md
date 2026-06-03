# Auth Route Table Audit

Scope: authenticated app mode only.

This audit maps the authenticated route declarations in `frontend/src/app/routes.tsx` to direct URL behaviour and primary/secondary navigation reachability after the auth navigation repair.

## Summary

Authenticated mode is selected when `appMode === "authenticated"`. In this mode, authenticated app routes are enabled by `shouldAllowAppRoutes`, public-auth pages redirect away to `/home`, and client routes render inside `VRMLayout`.

## Auth Route Table

| Route | Exists in code | Reachable via nav | Reachable via direct URL | Redirect behaviour | Notes |
|---|---:|---:|---:|---|---|
| `/` | Y | N | Y | Redirects to `/home` in authenticated mode. | Root is an auth landing redirect, not a visible nav destination. |
| `/create-account` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login. |
| `/login` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login. |
| `/verify-email` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login. |
| `/reset-password` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login. |
| `/reset-password/code` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login. |
| `/reset-password/new` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login. |
| `/contact` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login. |
| `/terms-and-conditions` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only legal page intentionally blocked after login by current route table. |
| `/privacy-policy` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only legal page intentionally blocked after login by current route table. |
| `/sub-processor-register` | Y | N | Y | Redirects to `/home` in authenticated mode. | Public-only page intentionally blocked after login by current route table. |
| `/dashboard` | Y | N | Y | Redirects to `/sites/{stored-or-default-site}/dashboard`. | Legacy dashboard redirect. Default fallback resolves to the default site id when no stored auth site exists. |
| `/sites` | Y | Y | Y | Redirects to `/sites/{stored-or-default-site}/dashboard?panel=sites`. | Reachable by clicking primary `Sites`; used as site selector entry. |
| `/home` | Y | Y | Y | Renders Home page. | Reachable by primary `Home`. |
| `/documents` | Y | Y | Y | Renders Documents page. | Reachable by primary `Documents` after repair. |
| `/settings` | Y | Y | Y | Redirects to `/settings/account`. | Reachable by primary `Settings` after repair. |
| `/settings/account` | Y | Y | Y | Renders My Account page. | Reachable by primary `Settings` redirect and Settings secondary nav. |
| `/settings/access` | Y | Y | Y | Renders Manage Access page. | Reachable by Settings secondary nav. |
| `/settings/alarms` | Y | N | Y | Redirects to `/settings/account`. | No active UI entry; `Create Alarm` is intentionally disabled in Settings secondary nav. |
| `/sites/:siteId` | Y | Y | Y | Redirects to `/sites/:siteId/dashboard`. | Reachable via site context paths and direct URL. |
| `/sites/:siteId/dashboard` | Y | Y | Y | Renders Dashboard page. | Reachable from secondary `Dashboard`, `/sites`, Home modules, and direct URL. |
| `/sites/:siteId/event-logs` | Y | Y | Y | Renders Event Logs page. | Reachable from secondary `Event Logs`. |
| `/sites/:siteId/alarm-logs` | Y | Y | Y | Renders Alarm Logs page. | Reachable from secondary `Alarm Logs` and Home `Monitor Fleet`. |
| `/sites/:siteId/device-list` | Y | Y | Y | Renders Device List page. | Reachable from secondary `Device List`. |
| `/sites/:siteId/reports` | Y | Y | Y | Renders Reports page. | Reachable from secondary `Reports`. |
| `/admin` | Conditional | Conditional | Conditional | Only declared for `userRole === "admin"`; client users fall through to wildcard `/home`. | Current login flow sets client role, so this is not part of normal client auth navigation. |
| `*` | Y | N | Y | Redirects to `/home` in authenticated mode. | Catch-all fallback. |

## Auth Primary Navigation Map

| Primary nav item | Visible in auth | Target / action | Runtime expectation |
|---|---:|---|---|
| Home | Y | `/home` | Click navigates to Home and marks Home active. |
| Sites | Y | Opens site selector via `/sites/{site}/dashboard?panel=sites` from non-site routes, or opens selector over current site route. | Click is actionable and never inert. |
| Documents | Y | `/documents` | Click navigates to Documents and marks Documents active. |
| Settings | Y | `/settings` | Click navigates to `/settings`, which redirects to `/settings/account`; Settings active. |
| Logout | Y | `/api/logout`, then `/login` | Click logs out and exits authenticated mode. |

## Auth Secondary Navigation Map

| Secondary nav item | Visible context | Target / action | Notes |
|---|---|---|---|
| All Sites pinned row | Site selector / site menu header | `/sites/all/dashboard` or opens selector | Auth has an `All Sites` site context. |
| Dashboard | Site menu | `/sites/:siteId/dashboard` | Enabled. |
| Analytics | Site menu | None | Intentionally disabled with `Coming Soon`. |
| Forecasts | Site menu | None | Intentionally disabled with `Coming Soon`. |
| Event Logs | Site menu | `/sites/:siteId/event-logs` | Enabled. |
| Alarm Logs | Site menu | `/sites/:siteId/alarm-logs` | Enabled. |
| Device List | Site menu | `/sites/:siteId/device-list` | Enabled. |
| Reports | Site menu | `/sites/:siteId/reports` | Enabled. |
| My Account | Settings routes | `/settings/account` | Enabled. |
| Manage Access | Settings routes | `/settings/access` | Enabled. |
| Create Alarm | Settings routes | None | Intentionally disabled. |

## Mismatches Found Before Repair

| Mismatch | Cause | Repair decision |
|---|---|---|
| `/documents` existed but primary `Documents` was visible and inert. | `VRMLayout` rendered the Documents row with `disabled` and no route target for all modes. | In authenticated mode, render `Documents` as a real nav row targeting `/documents`; keep Demo unchanged as a disabled placeholder. |
| `/settings` and `/settings/*` existed but primary `Settings` was visible and inert. | `VRMLayout` rendered the Settings row with `disabled` and no route target for all modes. | In authenticated mode, render `Settings` as a real nav row targeting `/settings`; keep Demo unchanged as a disabled placeholder. |
| Direct authenticated routes and visible primary nav disagreed. | Shared nav presentation did not distinguish authenticated-only routes from Demo placeholders. | Gate clickable route targets on `isAuthenticated`, not on demo state. |

## Demo Isolation Notes

The repair must not alter Demo behaviour. Demo keeps `isAuthenticated === false`, so the Documents and Settings rows continue through the existing disabled placeholder branch. Demo-specific state such as `isDemoSession`, `/demo` route prefixes, demo entry normalization, demo overlay, and demo session defaults are not changed by this audit or repair.
