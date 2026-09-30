import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [routes, layout, authenticatedLayout, portalApplication, portalContent, routeHelpers,
  home, deviceList, source, demoSource, login, recent] = await Promise.all([
  read("src/app/routes.tsx"),
  read("src/components/VRMLayout.tsx"),
  read("src/components/AuthenticatedVRMLayout.tsx"),
  read("src/components/PortalApplication.tsx"),
  read("src/components/PortalModuleContent.tsx"),
  read("src/features/organisation-dashboard/authenticatedPortalRoutes.ts"),
  read("src/features/home/HomePage.tsx"),
  read("src/features/devices/CanonicalDeviceList.tsx"),
  read("src/features/organisation-dashboard/authenticatedPortalSource.ts"),
  read("src/features/organisation-dashboard/demoPortalSource.ts"),
  read("src/features/auth/transport/login.ts"),
  read("src/features/organisation-dashboard/recentPortalDestinations.ts"),
]);

assert.match(routes, /<Route element=\{authenticatedShell\}>/);
assert.match(routes, /AuthenticatedApplicationProvider/);
assert.match(layout, /AuthenticatedVRMLayout/);
assert.match(authenticatedLayout, /data-testid="authenticated-app-shell"/);
assert.match(authenticatedLayout, /previewOrganisationId/);
assert.match(authenticatedLayout, /pinnedOrganisationId/);
assert.match(authenticatedLayout, /Full organisation/);
assert.match(authenticatedLayout, /PORTAL_MODULES\.map/);
assert.doesNotMatch(portalContent, /VRMLayout/);
assert.match(portalApplication, /PortalModuleContent/); // Demo retains its own wrapper.
assert.match(routeHelpers, /replaceScope/);
assert.match(routeHelpers, /replaceModule/);
assert.match(routeHelpers, /canonicalId/);
assert.match(home, /organisationPortalPath/);
assert.match(home, /sitePortalPath/);
assert.doesNotMatch(home, /sites\/all|site-a|site-b|getStoredSiteId|getDefaultSiteId/);
assert.match(deviceList, /replaceModule\(portalLocation, "event-logs"\)/);
assert.match(recent, /organisations\.find/);
assert.match(recent, /authenticatedPortalPath/);
assert.doesNotMatch(source, /demoPortalSource|DemoDashboardRoute|sessionStorage|desired_state/);
assert.match(source, /JSON\.stringify\(\{ enabled \}\)/);
assert.match(demoSource, /demoDeviceControl/);
assert.match(login, /JSON\.stringify\(\{ identifier:/);

console.log("Phase C one-shell architecture checks passed.");
