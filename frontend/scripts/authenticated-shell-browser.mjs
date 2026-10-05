import { chromium } from "playwright";
import { expect } from "@playwright/test";

const baseUrl = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });

const manySites = Array.from({ length: 28 }, (_, index) => ({
  id: String(100 + index),
  name: index === 0 ? "A Site With A Deliberately Long Production Name" : `Branch ${index + 1}`,
}));
const organisations = [
  { id: "1", name: "Demo", role: 0, sites: [{ id: "1", name: "Alis Barber" }, { id: "2", name: "Tokis Takeout" }] },
  { id: "4", name: "Camos Retail", role: 1, sites: manySites },
  { id: "9", name: "New Organisation", role: 1, sites: [] },
];

const portalContext = (organisationId) => {
  const organisation = organisations.find((candidate) => candidate.id === organisationId) ?? organisations[0];
  return {
    organisation: { id: organisation.id, name: organisation.name, slug: organisation.name.toLowerCase().replaceAll(" ", "-"), enabled: true, realtime: true },
    sites: organisation.sites.map((site) => ({ ...site, slug: site.name.toLowerCase().replaceAll(" ", "-"), organisation_id: organisation.id, enabled: true, realtime: true, max_capacity: 10 })),
    sources: [],
    clock: { server_now: "2026-09-30T12:00:00Z", effective_now: "2026-09-30T12:00:00Z", time_zone: "Europe/London" },
    membership: { role: organisation.role },
  };
};

const installApi = async (page) => {
  let requestCount = 0;
  await page.route("**/api/**", async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const organisationId = path.match(/\/api\/portal\/organisations\/(\d+)/)?.[1] ?? "1";
    const siteId = url.searchParams.get("site_id");
    let body = {};
    if (path === "/api/me") body = { user: { id: "0", name: "aligg", email: "user@example.com" } };
    else if (path === "/api/portal/organisations") body = { organisations };
    else if (path === "/api/documents") body = { documents: [] };
    else if (path.endsWith("/context")) body = portalContext(organisationId);
    else if (path.endsWith("/alarms")) body = { scope: { organisation_id: organisationId, site_id: siteId }, active: { items: [] }, cleared: { items: [] } };
    else body = { scope: { organisation_id: organisationId, site_id: siteId }, items: [], total: 0, page: { next_cursor: null } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return () => requestCount;
};

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.setDefaultTimeout(8_000);
desktop.on("pageerror", (error) => console.error("desktop page error", error));
desktop.on("console", (message) => { if (message.type() === "error") console.error("desktop console error", message.text()); });
const desktopRequests = await installApi(desktop);
await desktop.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
const shell = desktop.getByTestId("authenticated-app-shell");
const rail = desktop.getByRole("navigation", { name: "Authenticated navigation" });
const trigger = desktop.locator(".authenticated-navigation__rail-trigger");
await expect(shell).toBeVisible();
await expect(rail).toHaveCSS("width", "64px");
await expect(desktop.locator(".authenticated-navigation__pod")).toHaveCount(0);
await expect(desktop.locator(".authenticated-navigation__compact-destinations")).toBeVisible();
await expect(desktop.locator(".authenticated-navigation__compact-utility")).toBeVisible();
const mainBefore = await desktop.locator(".authenticated-layout__main").boundingBox();

// Hover opens the pod without fetching or moving content.
const requestsBeforeHover = desktopRequests();
await rail.hover({ position: { x: 10, y: 300 } });
await expect(desktop.locator(".authenticated-navigation__primary")).toBeVisible();
await expect(desktop.locator(".authenticated-navigation__compact-destinations")).toHaveCount(0);
await expect(desktop.locator(".authenticated-navigation__compact-utility")).toHaveCount(0);
for (const label of ["Home", "Demo", "Camos Retail", "New Organisation", "Documents", "Settings", "Logout"])
  await expect(desktop.locator(".authenticated-navigation__primary").getByRole("button", { name: label, exact: true })).toHaveCount(1);
expect(desktopRequests()).toBe(requestsBeforeHover);
const mainOpen = await desktop.locator(".authenticated-layout__main").boundingBox();
expect(mainOpen?.x).toBe(mainBefore?.x);
expect(mainOpen?.width).toBe(mainBefore?.width);

const primary = desktop.locator(".authenticated-navigation__primary");
const orgButton = (name) => primary.getByRole("button", { name, exact: true });
await orgButton("Demo").hover();
const demoScopes = desktop.getByRole("navigation", { name: "Demo scope selector" });
await expect(demoScopes).toBeVisible();
await expect(demoScopes.getByRole("button", { name: "All Sites" })).toBeVisible();
await expect(desktop).toHaveURL(/\/home$/);

// Switching previews is immediate; a zero-Site organisation still exposes All Sites.
await orgButton("New Organisation").hover();
const emptyScopes = desktop.getByRole("navigation", { name: "New Organisation scope selector" });
await expect(emptyScopes.getByRole("button")).toHaveCount(1); // All Sites only; no fake Site
await expect(emptyScopes.getByRole("button", { name: "All Sites" })).toBeVisible();
await orgButton("Demo").hover();

// Scope selection keeps the pod open and advances to modules.
await demoScopes.getByRole("button", { name: "Tokis Takeout" }).click();
await expect(desktop).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/dashboard$/);
const demoModules = desktop.getByRole("navigation", { name: "Demo module navigation" });
await expect(demoModules.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
await expect(desktop.locator(".authenticated-navigation__pod")).toBeVisible();

// Module selection completes navigation and closes.
await demoModules.getByRole("button", { name: "Event Logs" }).click();
await expect(desktop).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await expect(desktop.locator(".authenticated-navigation__pod")).toHaveCount(0);

// Contextual reopen enters the active module stage; same-org scope switching preserves module.
await rail.hover({ position: { x: 10, y: 300 } });
await expect(desktop.getByRole("navigation", { name: "Demo module navigation" }).getByRole("button", { name: "Event Logs" })).toHaveAttribute("aria-current", "page");
await desktop.getByRole("button", { name: "Change scope for Demo" }).click();
await desktop.getByRole("navigation", { name: "Demo scope selector" }).getByRole("button", { name: "Alis Barber" }).click();
await expect(desktop).toHaveURL(/\/sites\/organisations\/1\/sites\/1\/event-logs$/);
await expect(desktop.getByRole("navigation", { name: "Demo module navigation" }).getByRole("button", { name: "Event Logs" })).toHaveAttribute("aria-current", "page");

// Different-org scope switching resets Dashboard and long lists have one scroll owner.
await orgButton("Camos Retail").hover();
const retailScopes = desktop.getByRole("navigation", { name: "Camos Retail scope selector" });
const list = retailScopes.locator(".authenticated-navigation__panel-list");
const scrollMetrics = await list.evaluate((node) => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }));
expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
await retailScopes.getByRole("button", { name: "Branch 2", exact: true }).click();
await expect(desktop).toHaveURL(/\/sites\/organisations\/4\/sites\/101\/dashboard$/);
await expect(desktop.getByRole("navigation", { name: "Camos Retail module navigation" }).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

// Escape restores focus and pointer leave closes the connected pod.
await desktop.keyboard.press("Escape");
await expect(desktop.locator(".authenticated-navigation__pod")).toHaveCount(0);
await expect(desktop.getByRole("button", { name: "Open navigation" })).toBeFocused();
await rail.hover({ position: { x: 10, y: 300 } });
await orgButton("Demo").hover();
await demoScopes.hover();
await desktop.locator(".authenticated-layout__main").hover();
await desktop.waitForTimeout(150);
await expect(desktop.locator(".authenticated-navigation__pod")).toHaveCount(0);

// Settings previews without navigation and destinations close the pod.
await rail.hover({ position: { x: 10, y: 300 } });
const currentUrl = desktop.url();
await primary.getByRole("button", { name: "Settings", exact: true }).hover();
const settings = desktop.getByRole("navigation", { name: "Settings navigation" });
await expect(settings.getByRole("button", { name: "My Account" })).toBeVisible();
await expect(desktop).toHaveURL(currentUrl);
await settings.getByRole("button", { name: "Manage Access" }).click();
await expect(desktop).toHaveURL(/\/settings\/access$/);
await expect(desktop.locator(".authenticated-navigation__pod")).toHaveCount(0);
await trigger.focus();
await expect(desktop.getByRole("navigation", { name: "Settings navigation" })).toBeVisible();

// Direct routes and browser history reconstruct canonical context.
await desktop.goto(`${baseUrl}/sites/organisations/1/sites/2/reports`, { waitUntil: "networkidle" });
await rail.hover({ position: { x: 10, y: 300 } });
await expect(desktop.getByRole("navigation", { name: "Demo module navigation" }).getByRole("button", { name: "Reports" })).toHaveAttribute("aria-current", "page");
await desktop.waitForTimeout(180);
await desktop.screenshot({ path: "/tmp/portal-authenticated-navigation-desktop-open.png", fullPage: true });
await desktop.getByRole("button", { name: "Home", exact: true }).click();
await expect(desktop).toHaveURL(/\/home$/);
await desktop.goBack();
await expect(desktop).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/reports$/);
await expect(desktop.locator(".authenticated-navigation__pod")).toHaveCount(0);
await desktop.screenshot({ path: "/tmp/portal-authenticated-navigation-desktop.png", fullPage: true });

// Touch/coarse-pointer stage flow uses one panel at a time.
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mobile = await mobileContext.newPage();
mobile.setDefaultTimeout(8_000);
await installApi(mobile);
await mobile.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
const mobileRail = mobile.locator(".authenticated-navigation__rail");
const mobileTrigger = mobile.locator(".authenticated-navigation__rail-trigger");
await expect(mobileRail).toHaveCSS("width", "56px");
await expect(mobile.locator(".authenticated-navigation__compact-destinations")).toBeVisible();

// Every part of the closed touch rail has one action: open Primary without navigating.
const assertPrimaryOnly = async (url) => {
  await expect(mobile.locator(".authenticated-navigation__primary")).toBeVisible();
  await expect(mobile.locator(".authenticated-navigation__secondary")).toHaveCount(0);
  await expect(mobile.locator(".authenticated-navigation__compact-destinations")).toHaveCount(0);
  await expect(mobile.locator(".authenticated-navigation__compact-utility")).toHaveCount(0);
  await expect(mobile).toHaveURL(url);
};
const closePrimary = async () => {
  await mobileTrigger.click();
  await expect(mobile.locator(".authenticated-navigation__pod")).toHaveCount(0);
};
const homeRoute = mobile.url();
await mobileRail.click({ position: { x: 28, y: 500 } });
await assertPrimaryOnly(homeRoute);
await closePrimary();
for (const label of ["Home", "Demo", "Documents", "Settings", "Logout"]) {
  await mobile.getByRole("button", { name: `Open primary navigation from ${label}`, exact: true }).click();
  await assertPrimaryOnly(homeRoute);
  await closePrimary();
}
await mobileTrigger.click();
await assertPrimaryOnly(homeRoute);
await closePrimary();

// Direct destinations act only after Primary is expanded and then close it.
await mobile.getByRole("button", { name: "Open primary navigation from Documents", exact: true }).click();
await mobile.locator(".authenticated-navigation__primary").getByRole("button", { name: "Documents", exact: true }).click();
await expect(mobile).toHaveURL(/\/documents$/);
await expect(mobile.locator(".authenticated-navigation__pod")).toHaveCount(0);
await mobile.waitForTimeout(50);
const documentsRoute = mobile.url();
await mobileTrigger.click();
await assertPrimaryOnly(documentsRoute);
await mobile.locator(".authenticated-navigation__primary").getByRole("button", { name: "Home", exact: true }).click();
await expect(mobile).toHaveURL(/\/home$/);
await expect(mobile.locator(".authenticated-navigation__pod")).toHaveCount(0);

await mobile.locator(".authenticated-navigation__rail-trigger").click();
await expect(mobile.locator(".authenticated-navigation__primary")).toBeVisible();
await expect(mobile.locator(".authenticated-navigation__compact-destinations")).toHaveCount(0);
await mobile.locator(".authenticated-navigation__primary").getByRole("button", { name: "Demo", exact: true }).click();
await expect(mobile.locator(".authenticated-navigation__primary")).toHaveCount(0);
await expect(mobile.locator(".authenticated-navigation__compact-destinations")).toHaveCount(0);
const mobileScopes = mobile.getByRole("navigation", { name: "Demo scope selector" });
await expect(mobileScopes.getByRole("button", { name: "Back to primary navigation" })).toBeVisible();
await mobileScopes.getByRole("button", { name: "Tokis Takeout" }).click();
await expect(mobile).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/dashboard$/);
const mobileModules = mobile.getByRole("navigation", { name: "Demo module navigation" });
await expect(mobileModules).toBeVisible();
await mobileModules.getByRole("button", { name: "Event Logs" }).click();
await expect(mobile).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await expect(mobile.locator(".authenticated-navigation__pod")).toHaveCount(0);

// Re-enter through Primary and verify sidebar-only back transitions.
await mobileTrigger.click();
await mobile.locator(".authenticated-navigation__primary").getByRole("button", { name: "Demo", exact: true }).click();
await mobile.getByRole("navigation", { name: "Demo scope selector" }).getByRole("button", { name: "Tokis Takeout" }).click();
await mobile.getByRole("navigation", { name: "Demo module navigation" }).getByRole("button", { name: "Change scope for Demo" }).click();
await mobile.getByRole("button", { name: "Back to primary navigation" }).click();
await expect(mobile.locator(".authenticated-navigation__primary")).toBeVisible();

// Settings is a stage, not an automatic route change.
const homeUrl = mobile.url();
await mobile.locator(".authenticated-navigation__primary").getByRole("button", { name: "Settings", exact: true }).click();
await expect(mobile).toHaveURL(homeUrl);
const mobileSettings = mobile.getByRole("navigation", { name: "Settings navigation" });
await mobileSettings.getByRole("button", { name: "My Account" }).click();
await expect(mobile).toHaveURL(/\/settings\/account$/);
await expect(mobile.locator(".authenticated-navigation__pod")).toHaveCount(0);

// A closed touch rail always opens Primary, even on a Settings route.
await mobile.locator(".authenticated-navigation__rail-trigger").click();
await assertPrimaryOnly(mobile.url());
await mobile.locator(".authenticated-navigation__primary").getByRole("button", { name: "Settings", exact: true }).click();
await expect(mobile.getByRole("navigation", { name: "Settings navigation" })).toBeVisible();
const triggerBox = await mobile.getByRole("button", { name: "Close navigation" }).first().boundingBox();
expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
const railBox = await mobile.locator(".authenticated-navigation__rail").boundingBox();
const hitBox = await mobile.locator(".authenticated-navigation__rail-trigger").boundingBox();
expect(Math.abs((railBox.x + railBox.width / 2) - (hitBox.x + hitBox.width / 2))).toBeLessThan(0.6);
await mobile.waitForTimeout(190);
await mobile.screenshot({ path: "/tmp/portal-authenticated-navigation-mobile-open.png", fullPage: true });
await mobile.mouse.click(370, 400);
await expect(mobile.locator(".authenticated-navigation__pod")).toHaveCount(0);
await mobile.screenshot({ path: "/tmp/portal-authenticated-navigation-mobile.png", fullPage: true });

await mobileContext.close();
await browser.close();
console.log("Authenticated navigation pod browser checks passed.");
