import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [routes, layout, source, demoSource, login, deviceList] = await Promise.all([
  read("src/app/routes.tsx"),
  read("src/components/VRMLayout.tsx"),
  read("src/features/organisation-dashboard/authenticatedPortalSource.ts"),
  read("src/features/organisation-dashboard/demoPortalSource.ts"),
  read("src/features/auth/transport/login.ts"),
  read("src/features/devices/CanonicalDeviceList.tsx"),
]);

assert.match(routes, /sites\/organisations\/:organisationId\/sites\/:siteId\/:module/);
assert.match(routes, /sites\/organisations\/:organisationId\/:module/);
assert.match(layout, /authenticatedOrganisations\.map/);
assert.match(layout, /targetPath: `\/sites\/organisations\/\$\{/);
assert.doesNotMatch(source, /demoPortalSource|DemoDashboardRoute|sessionStorage|desired_state/);
assert.match(source, /JSON\.stringify\(\{ enabled \}\)/);
assert.match(source, /gateways\/by-site/);
assert.match(demoSource, /demoDeviceControl/);
assert.match(login, /JSON\.stringify\(\{ identifier:/);
assert.match(deviceList, /controlMode === "simulated"/);
assert.match(deviceList, /"Disable" : "Enable"/);

console.log("Phase C frontend architecture checks passed.");
