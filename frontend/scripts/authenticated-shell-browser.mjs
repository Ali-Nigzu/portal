import { chromium } from "playwright";
import { expect } from "@playwright/test";

const baseUrl = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(8_000);

const context = {
  organisation: { id: "1", name: "Demo", slug: "demo", enabled: true, realtime: true },
  sites: [
    { id: "1", name: "Alis Barber", slug: "alis-barber", organisation_id: "1", enabled: true, realtime: true, max_capacity: 10 },
    { id: "2", name: "Tokis Takeout", slug: "tokis-takeout", organisation_id: "1", enabled: true, realtime: true, max_capacity: 20 },
  ],
  sources: [],
  clock: { server_now: "2026-09-30T12:00:00Z", effective_now: "2026-09-30T12:00:00Z", time_zone: "Europe/London" },
  membership: { role: 0 },
};
const organisations = [
  { id: "1", name: "Demo", role: 0, sites: [{ id: "1", name: "Alis Barber" }, { id: "2", name: "Tokis Takeout" }] },
  { id: "4", name: "Camos Retail", role: 1, sites: [{ id: "40", name: "Norwich" }] },
  { id: "9", name: "Another Organisation", role: 1, sites: [{ id: "90", name: "Site X" }] },
];

await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  let body = {};
  if (path === "/api/me") body = { user: { id: "0", name: "aligg", email: "user@example.com" } };
  else if (path === "/api/portal/organisations") body = { organisations };
  else if (path.endsWith("/context")) body = context;
  else if (path.endsWith("/alarms")) body = { scope: { organisation_id: "1", site_id: null }, active: { items: [] }, cleared: { items: [] } };
  else body = { scope: { organisation_id: "1", site_id: null }, items: [], total: 0, page: { next_cursor: null } };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});

await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
await expect(page.getByRole("heading", { name: "Welcome aligg" })).toBeVisible();
const shell = page.getByTestId("authenticated-app-shell");
await expect(shell).toBeVisible();
await shell.evaluate((node) => { node.dataset.identity = "persistent"; });

await page.locator(".home-page__card-button--fleet").getByRole("button", { name: "Demo", exact: true }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/alarm-logs$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");
await page.getByRole("link", { name: "Home" }).click();
await page.locator(".home-page__card-button--sites").getByRole("button", { name: /Alis Barber/ }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/1\/dashboard$/);
await page.getByRole("link", { name: "Home" }).click();
const multiOrgUrl = page.url();
const retail = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Camos Retail", exact: true });
await retail.hover();
const retailNavigation = page.getByRole("navigation", { name: "Camos Retail navigation" });
await expect(retailNavigation.getByRole("button", { name: "Norwich" })).toBeVisible();
await expect(retailNavigation.getByRole("button", { name: "Tokis Takeout" })).toHaveCount(0);
await expect(page).toHaveURL(multiOrgUrl);
await page.getByRole("heading", { name: "Welcome aligg" }).hover();
await page.waitForTimeout(220);

const organisation = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Demo", exact: true });
const homeUrl = page.url();
await organisation.hover();
await expect(page.getByRole("navigation", { name: "Demo navigation" })).toBeVisible();
await expect(page).toHaveURL(homeUrl);
await expect(page.getByRole("heading", { name: "Welcome aligg" })).toBeVisible();
await page.getByRole("navigation", { name: "Demo navigation" }).hover();
await page.waitForTimeout(220);
await expect(page.getByRole("navigation", { name: "Demo navigation" })).toBeVisible();
await page.getByRole("heading", { name: "Welcome aligg" }).hover();
await page.waitForTimeout(220);
await expect(page.getByRole("navigation", { name: "Demo navigation" })).toHaveCount(0);
await organisation.click();
await expect(page).toHaveURL(homeUrl);

const secondary = page.getByRole("navigation", { name: "Demo navigation" });
await secondary.getByRole("button", { name: "Tokis Takeout" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/dashboard$/);
await secondary.getByRole("button", { name: "Event Logs" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");
await secondary.getByRole("button", { name: "Alarm Logs" }).click();
await secondary.getByRole("button", { name: "Alis Barber" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/1\/alarm-logs$/);
await secondary.getByRole("button", { name: "Reports" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/1\/reports$/);
await secondary.getByRole("button", { name: "Full organisation" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/reports$/);

await page.getByRole("link", { name: "Home" }).click();
await expect(page).toHaveURL(/\/home$/);
const keyboardOrganisation = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Demo", exact: true });
await keyboardOrganisation.focus();
await keyboardOrganisation.press("Enter");
await expect(page.getByRole("navigation", { name: "Demo navigation" })).toBeVisible();
await keyboardOrganisation.press("Tab");
await expect(page.getByRole("navigation", { name: "Demo navigation" }).getByRole("button", { name: "Full organisation" })).toBeFocused();
await page.keyboard.press("Escape");
await expect(keyboardOrganisation).toBeFocused();
await keyboardOrganisation.press("Space");
await expect(page.getByRole("navigation", { name: "Demo navigation" })).toBeVisible();
await page.keyboard.press("Escape");

await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Open primary navigation" }).click();
const mobileUrl = page.url();
await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Demo", exact: true }).click();
await expect(page).toHaveURL(mobileUrl);
const mobileSecondary = page.getByRole("navigation", { name: "Demo navigation" });
await mobileSecondary.getByRole("button", { name: "Tokis Takeout" }).click();
await mobileSecondary.getByRole("button", { name: "Event Logs" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");

await page.getByRole("button", { name: "Open primary navigation" }).click();
await page.locator("#vrm-primary-rail").getByText("Documents", { exact: true }).click();
await expect(page).toHaveURL(/\/documents$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");
await page.goBack();
await expect(page).toHaveURL(/\/sites\/organisations\/1\/sites\/2\/event-logs$/);
await expect(shell).toHaveAttribute("data-identity", "persistent");

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${baseUrl}/sites/organisations/1/sites/2/reports`, { waitUntil: "networkidle" });
await expect(page.getByTestId("authenticated-app-shell")).toBeVisible();
await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Demo", exact: true })).toHaveClass(/vrm-nav-row--active/);
await expect(page.getByRole("navigation", { name: "Demo navigation" }).getByRole("button", { name: "Tokis Takeout" })).toHaveClass(/vrm-nav-row--active/);
await expect(page.getByRole("navigation", { name: "Demo navigation" }).getByRole("button", { name: "Reports" })).toHaveClass(/vrm-nav-row--active/);
await page.screenshot({ path: "/tmp/portal-authenticated-one-shell.png", fullPage: true });
await browser.close();
console.log("Authenticated shell browser checks passed.");
