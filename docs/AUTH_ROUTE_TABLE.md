# Current route contract

Root `/` always redirects to `/home`. Public Home renders Landing; customer Home
renders inside `AuthenticatedAppShell` and `AuthenticatedApplicationProvider`.
Admin remains the internal `/admin` route of this same frontend and is absent from
customer navigation; its separate session is intentionally independent.

| Routes | Current contract |
| --- | --- |
| `/login`, `/create-account`, `/verify-email` | Public auth pages; authenticated customers redirect to Home |
| `/reset-password`, `/reset-password/code`, `/reset-password/new` | Existing public reset journey; authenticated redirect to Home |
| `/contact` | Available in public and customer states |
| `/terms-and-conditions`, `/privacy-policy`, `/sub-processor-register` | Public pages; existing authenticated redirect to Home |
| `/documents` | Canonical customer Documents; unauthenticated login redirect |
| `/settings` | Redirect to `/settings/account` |
| `/settings/account`, `/settings/access` | Canonical account/access pages |
| `/settings/alarms` | Existing redirect to account |
| `/sites/organisations/:organisationId/:module` | Canonical organisation Portal; membership-scoped |
| `/sites/organisations/:organisationId/sites/:siteId/:module` | Canonical site Portal; membership-scoped |
| `/sites` | Authenticated redirect to Home; historical Demo/view-token behavior preserved |
| `/demo`, `/demo/:organisationSlug/:module`, `/demo/:organisationSlug/:siteSlug/:module` | Current public Demo product |
| `/dashboard`, `/sites/:siteId` and module deep links | Existing compatibility redirects/routes; preserved |
| `/admin` and descendants | Canonical Admin; separate customer-independent session |
| Unmatched route | Existing access-state-dependent redirect |

All query preservation, selected-site storage, Demo redirects, error/empty/loading
states and navigation remain defined by `frontend/src/app/routes.tsx`.
Compatibility URL handling is documented in [compatibility-surface.md](compatibility-surface.md).
