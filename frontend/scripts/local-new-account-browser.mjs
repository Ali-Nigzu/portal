import { chromium } from "playwright";
import { expect } from "@playwright/test";

const baseUrl = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(12_000);

await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
await page.getByLabel("Email or username").fill("test");
await page.getByRole("button", { name: /continue/i }).click();
await page.getByLabel("Password").fill("test");
await page.getByRole("button", { name: /login|sign in/i }).click();
await expect(page).toHaveURL(/\/home$/);
await expect(page.getByRole("heading", { name: "Welcome Test User" })).toBeVisible();
await expect(page.getByText("No Sites connected.", { exact: true })).toBeVisible();

await page.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
const primary = page.getByRole("navigation", { name: "Primary" });
for (const label of ["Home", "My Org", "Documents", "Settings", "Logout"])
  await expect(primary.getByText(label, { exact: true })).toBeVisible();

await primary.getByRole("button", { name: "My Org", exact: true }).click();
const scopes = page.getByRole("navigation", { name: "My Org scope selector" });
await expect(scopes.getByRole("button", { name: "All Sites" })).toBeVisible();
await expect(scopes.locator(".authenticated-navigation__row")).toHaveCount(1);
await scopes.getByRole("button", { name: "All Sites" }).click();
await expect(page).toHaveURL(/\/sites\/organisations\/900000000000000101\/dashboard$/);

const modules = page.getByRole("navigation", { name: "My Org module navigation" });
for (const label of ["Dashboard", "Event Logs", "Alarm Logs", "Device List", "Reports"])
  await expect(modules.getByRole("button", { name: label })).toBeVisible();
await expect(page.getByText("Snapshot unavailable.", { exact: false })).toHaveCount(0);
await expect(page.getByText("Site Flow", { exact: true })).toBeVisible();
await expect(page.locator(".dashboard-v2__kpi-tile")).toHaveCount(7);

await modules.getByRole("button", { name: "Event Logs" }).click();
await expect(page.getByText("No events found", { exact: true })).toBeVisible();
await expect(page.getByText("0", { exact: true }).first()).toBeVisible();

await page.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
await page.getByRole("navigation", { name: "My Org module navigation" }).getByRole("button", { name: "Alarm Logs" }).click();
await expect(page.getByText("No active alarms", { exact: true })).toBeVisible();
await expect(page.getByText("No cleared alarms", { exact: true })).toBeVisible();

await page.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
await page.getByRole("navigation", { name: "My Org module navigation" }).getByRole("button", { name: "Device List" }).click();
await expect(page.getByText("No sources in this scope.", { exact: true })).toHaveCount(0);
await expect(page.locator(".device-runtime-card")).toHaveCount(0);
await expect(page.getByRole("button", { name: "Refresh All" })).toBeVisible();
await expect(page.getByText("Gateways", { exact: true })).toBeVisible();

await page.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
await page.getByRole("navigation", { name: "My Org module navigation" }).getByRole("button", { name: "Reports" }).click();
await expect(page.getByRole("heading", { name: "No report data yet" })).toHaveCount(0);
await expect(page.getByRole("combobox", { name: "Period" })).toBeVisible();
await expect(page.getByRole("combobox", { name: "Period" }).locator("option")).toHaveCount(7);
for (const report of ["Site Activity", "Visitor Profile"]) {
  await page.getByRole("button", { name: new RegExp(report) }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Report" }).click();
  const download = await pending;
  if (!download.suggestedFilename().startsWith("My-Org-")) throw new Error("Incorrect report identity");
  if (await download.failure()) throw new Error("Zero report download failed");
}


await page.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
await page.getByRole("navigation", { name: "Primary" }).getByText("Documents", { exact: true }).click();
await expect(page.getByRole("heading", { name: "My Documents" })).toBeVisible();
await page.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
await page.getByRole("navigation", { name: "Primary" }).getByText("Settings", { exact: true }).click();
await page.getByRole("navigation", { name: "Settings navigation" }).getByRole("button", { name: "My Account" }).click();
await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible();
await expect(page.getByText("Test User", { exact: true })).toBeVisible();

await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/portal-local-new-account.png", fullPage: true });
await browser.close();
console.log("Local new-account authenticated browser checks passed.");
