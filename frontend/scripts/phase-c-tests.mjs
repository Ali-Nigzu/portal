import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

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
assert.match(authenticatedLayout, /AuthenticatedNavigationPod/);
assert.match(authenticatedLayout, /useAuthenticatedNavigation/);
const [scopePanel, modulePanel, navigation] = await Promise.all([
  read("src/components/authenticated-navigation/OrganisationScopePanel.tsx"),
  read("src/components/authenticated-navigation/PortalModulePanel.tsx"),
  read("src/components/authenticated-navigation/useAuthenticatedNavigation.ts"),
]);
assert.match(scopePanel, /All Sites/);
assert.match(scopePanel, /Add Site/);
assert.match(modulePanel, /PORTAL_MODULES\.map/);
assert.match(navigation, /routeContext\.organisationId === organisationId/);
assert.match(navigation, /routeContext\.module/);
await build({entryPoints:["src/components/authenticated-navigation/authenticatedNavigationModel.ts"],bundle:true,format:"esm",platform:"node",outfile:".tmp/phase-c/navigation.mjs"});
const { navigationReducer, contextualStage } = await import("../.tmp/phase-c/navigation.mjs");
const portal = {area:"portal",organisationId:"900000000000000101",siteId:"17",module:"reports"};
assert.deepEqual(contextualStage(portal),{kind:"scope-modules",organisationId:portal.organisationId,siteId:"17"});
assert.deepEqual(contextualStage({area:"settings",section:"access"}),{kind:"settings"});
assert.deepEqual(contextualStage({area:"home"}),{kind:"primary"});
let state = navigationReducer({status:"closed"},{type:"open",stage:contextualStage(portal)});
assert.equal(state.stage.kind,"scope-modules");
state = navigationReducer(state,{type:"show-scopes",organisationId:portal.organisationId});
assert.deepEqual(state,{status:"open",stage:{kind:"organisation-scopes",organisationId:portal.organisationId}});
assert.deepEqual(navigationReducer(state,{type:"close"}),{status:"closed"});
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
