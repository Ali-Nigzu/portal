import { chromium } from "playwright";
import { expect } from "@playwright/test";

const baseUrl = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(8_000);

const organisations = [
  { id: "1", name: "Demo", role: 0, sites: [{ id: "1", name: "Alis Barber" }, { id: "2", name: "Tokis Takeout" }] },
  { id: "4", name: "Camos Retail", role: 1, sites: [{ id: "40", name: "Norwich" }] },
  { id: "9", name: "Another Organisation", role: 1, sites: [{ id: "90", name: "Site X" }] },
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

await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const organisationId = path.match(/\/api\/portal\/organisations\/(\d+)/)?.[1] ?? "1";
  const siteId = url.searchParams.get("site_id");
  let body = {};
  if (path === "/api/me") body = { user: { id: "0", name: "aligg", email: "user@example.com" } };
  else if (path === "/api/portal/organisations") body = { organisations };
  else if (path.endsWith("/context")) body = portalContext(organisationId);
  else if (path.endsWith("/alarms")) body = { scope: { organisation_id: organisationId, site_id: siteId }, active: { items: [] }, cleared: { items: [] } };
  else body = { scope: { organisation_id: organisationId, site_id: siteId }, items: [], total: 0, page: { next_cursor: null } };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});

const primary = () => page.getByRole("navigation", { name: "Primary" });
const organisationButton = (name) => primary().getByRole("button", { name, exact: true });
const scopeNavigation = (name) => page.getByRole("navigation", { name: `${name} scope selector` });
const moduleNavigation = (name) => page.getByRole("navigation", { name: `${name} module navigation` });

await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
await expect(page.getByRole("heading", { name: "Welcome aligg" })).toBeVisible();
const shell = page.getByTestId("authenticated-app-shell");
await expect(shell).toBeVisible();
await shell.evaluate((node) => { node.dataset.identity = "persistent"; });
await expect(page.locator("#vrm-secondary-panel")).toHaveCount(0);

// A desktop hover exposes only the organisation's scopes and does not navigate.
const homeUrl = page.url();
await organisationButton("Demo").hover();
const demoScopes = scopeNavigation("Demo");
await expect(demoScopes).toBeVisible();
await expect(demoScopes.getByRole("button", { name: "All Sites" })).toBeVisible();
await expect(demoScopes.getByRole("button", { name: "Tokis Takeout" })).toBeVisible();
await expect(demoScopes.getByRole("button", { name: "Event Logs" })).toHaveCount(0);
await expect(page).toHaveURL(homeUrl);
await expect(page.getByRole("heading", { name: "Welcome aligg" })).toBeVisible();
await demoScopes.hover();
await page.waitForTimeout(220);
await expect(demoScopes).toBeVisible();
await page.getByRole("heading", { name: "Welcome aligg" }).hover();
await page.waitForTimeout(220);
await expect(scopeNavigation("Demo")).toHaveCount(0);

// Click pins the selector. Selecting a scope from Home enters Dashboard and replaces scopes with modules.
await organisationButton("Demo").click();
await expect(page).toHaveURL(homeUrl);
await scopeNavigation("Demo").getByRole("button", { name: "Tokis Takeout" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/dashboard$/);
const demoModules = moduleNavigation("Demo");
await expect(demoModules.getByRole("button", { name: "Tokis Takeout" })).toBeVisible();
await expect(demoModules.getByRole("button", { name: "Event Logs" })).toBeVisible();
await expect(demoModules.getByRole("button", { name: "Alis Barber" })).toHaveCount(0);
await expect(shell).toHaveAttribute("data-identity", "persistent");

// Normal module changes preserve scope; reopening the selector and changing scope preserves the module.
await demoModules.getByRole("button", { name: "Event Logs" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await demoModules.getByRole("button", { name: "Tokis Takeout" }).click();
await expect(scopeNavigation("Demo")).toBeVisible();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await scopeNavigation("Demo").getByRole("button", { name: "Alis Barber" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/1\/event-logs$/);
await moduleNavigation("Demo").getByRole("button", { name: "Reports" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/1\/reports$/);

// Previewing another organisation keeps routed content unchanged; leaving restores routed modules.
const demoReportsUrl = page.url();
await organisationButton("Camos Retail").hover();
const retailScopes = scopeNavigation("Camos Retail");
await expect(retailScopes.getByRole("button", { name: "Norwich" })).toBeVisible();
await expect(retailScopes.getByRole("button", { name: "Tokis Takeout" })).toHaveCount(0);
await expect(page).toHaveURL(demoReportsUrl);
await page.locator(".vrm-main").hover();
await page.waitForTimeout(220);
await expect(moduleNavigation("Demo")).toBeVisible();
await expect(moduleNavigation("Demo").getByRole("button", { name: "Reports" })).toHaveClass(/vrm-nav-row--active/);

// Selecting a scope in a different organisation resets to Dashboard.
await organisationButton("Camos Retail").click();
await scopeNavigation("Camos Retail").getByRole("button", { name: "Norwich" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/4\/sites\/40\/dashboard$/);
await expect(moduleNavigation("Camos Retail").getByRole("button", { name: "Norwich" })).toBeVisible();

// Home shortcuts enter canonical routes directly in module mode.
await page.getByRole("link", { name: "Home" }).click();
await page.locator(".home-page__card-button--fleet").getByRole("button", { name: "Demo", exact: true }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/alarm-logs$/);
await expect(moduleNavigation("Demo").getByRole("button", { name: "All Sites" })).toBeVisible();
await expect(moduleNavigation("Demo").getByRole("button", { name: "Alarm Logs" })).toHaveClass(/vrm-nav-row--active/);
await page.getByRole("link", { name: "Home" }).click();
await page.locator(".home-page__card-button--sites").getByRole("button", { name: /Alis Barber/ }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/1\/dashboard$/);
await expect(moduleNavigation("Demo").getByRole("button", { name: "Alis Barber" })).toBeVisible();

// Keyboard activation opens scopes, Tab enters them, and Escape closes with focus restoration.
await page.getByRole("link", { name: "Home" }).click();
const keyboardOrganisation = organisationButton("Demo");
await keyboardOrganisation.focus();
await keyboardOrganisation.press("Enter");
await expect(scopeNavigation("Demo")).toBeVisible();
await keyboardOrganisation.press("Tab");
await expect(scopeNavigation("Demo").getByRole("button", { name: "All Sites" })).toBeFocused();
await page.keyboard.press("Escape");
await expect(keyboardOrganisation).toBeFocused();
await expect(page.locator("#vrm-secondary-panel")).toHaveCount(0);
await keyboardOrganisation.press("Space");
await expect(scopeNavigation("Demo")).toBeVisible();
await page.keyboard.press("Escape");

// Touch interaction uses tap and keeps the secondary drawer open across the scope-to-module transition.
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Open primary navigation" }).click();
const mobileUrl = page.url();
await organisationButton("Demo").click();
await expect(page).toHaveURL(mobileUrl);
await expect(scopeNavigation("Demo").getByRole("button", { name: "Event Logs" })).toHaveCount(0);
await scopeNavigation("Demo").getByRole("button", { name: "Tokis Takeout" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/dashboard$/);
await expect(moduleNavigation("Demo").getByRole("button", { name: "Tokis Takeout" })).toBeVisible();
await moduleNavigation("Demo").getByRole("button", { name: "Event Logs" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");

// The persistent shell survives unrelated routes and browser history.
await page.getByRole("button", { name: "Open primary navigation" }).click();
await page.locator("#vrm-primary-rail").getByText("Documents", { exact: true }).click();
await expect(page).toHaveURL(/\/documents$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");
await page.goBack();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");

// A direct canonical route reconstructs the module state without transient selector state.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${baseUrl}/sites/organisations/1/sites/2/reports`, { waitUntil: "networkidle" });
await expect(page.getByTestId("authenticated-app-shell")).toBeVisible();
await expect(organisationButton("Demo")).toHaveClass(/vrm-nav-row--active/);
await expect(moduleNavigation("Demo").getByRole("button", { name: "Tokis Takeout" })).toBeVisible();
await expect(moduleNavigation("Demo").getByRole("button", { name: "Reports" })).toHaveClass(/vrm-nav-row--active/);
await expect(moduleNavigation("Demo").getByRole("button", { name: "Alis Barber" })).toHaveCount(0);
await page.screenshot({ path: "/tmp/portal-authenticated-sidebar.png", fullPage: true });

await browser.close();
console.log("Authenticated staged-sidebar browser checks passed.");
