import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
const base = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const runtime = spawn(
  process.env.PORTAL_TEST_PYTHON ?? "python",
  ["-m", "backend.tests.run_admin_browser"],
  { cwd: "..", env: process.env, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "",
  browser;
runtime.stdout.on("data", (d) => (log += d));
runtime.stderr.on("data", (d) => (log += d));
const errors = [];
const headers = { "X-Requested-With": "camOS", Origin: base };
const customer = async (page, name) => {
  await page.goto(base + "/login");
  await page.getByLabel("Email or username").fill(name);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-admin-browser-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
};
try {
  await expect
    .poll(
      async () => {
        if (runtime.exitCode !== null) throw Error(log);
        try {
          return (await fetch("http://127.0.0.1:8000/api/admin/me")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20000 },
    )
    .toBe(401);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PORTAL_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PORTAL_BROWSER_EXECUTABLE }
      : {}),
  });
  await mkdir("test-results/admin", { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://consent.cookiebot.com/**", (r) => r.abort());
  await page.goto(base + "/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-admin-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid username");
  await page.getByLabel("Username", { exact: true }).fill("admin-browser");
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-admin-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("navigation", { name: "Admin tables" }).getByRole("button"),
  ).toHaveCount(11);
  for (const name of [
    "Organisations",
    "Sites",
    "Devices",
    "Gateways",
    "Organisation Snapshots",
    "Site Snapshots",
    "Users",
    "Memberships",
    "Alarms",
    "User Lifecycle Challenges",
  ]) {
    await page
      .getByRole("navigation", { name: "Admin tables" })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
  }
  await page
    .getByRole("navigation", { name: "Admin tables" })
    .getByRole("button", { name: "Organisations", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Add Row", exact: true }).click();
  await page.locator("#field-name").fill("Browser Organisation");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Row saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Browser Organisation", exact: true }),
  ).toBeVisible();
  let tr = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", {
        name: "Browser Organisation",
        exact: true,
      }),
    });
  await tr.getByRole("button", { name: "Context", exact: true }).click();
  await expect(page.getByText("MISSING", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Site", exact: true }).click();
  await expect(page.locator("#field-organisation_id")).not.toHaveValue("");
  await page.locator("#field-name").fill("Browser Site");
  await page.locator("#field-max_capacity").fill("50");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Browser Site/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Device", exact: true }).click();
  await page.locator("#field-name").fill("Browser Camera");
  await page.locator("#field-analysis_interval_minutes").fill("15");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Devices (1)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ Create Site Snapshot", exact: true })
    .click();
  await page.locator("#field-ts").fill("2026-10-08T12:00:00.123456Z");
  await page.locator("#field-updated_at").fill("2026-10-08T12:00:00.123456Z");
  await page
    .locator("#field-payload")
    .fill('{"precise":12345678901234567890.1234567890123456789}');
  await page.locator("#field-state").fill("null");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Site Snapshot", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Site Snapshot", exact: true })
    .click();
  await expect(page.locator("#field-payload")).toHaveValue(
    /12345678901234567890\.1234567890123456789/,
  );
  await page.locator("#field-state").fill('{"updated":true}');
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Site Snapshot", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/admin/context-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Admin tables" }),
  ).toBeVisible();
  assert.equal((await page.request.get(base + "/api/me")).status(), 401);
  assert.equal(
    (
      await page.request.post(base + "/api/login", {
        headers,
        data: {
          identifier: "admin-browser",
          password: "isolated-admin-browser-password",
        },
      })
    ).status(),
    401,
  );
  const mobile = await browser.newContext({
    viewport: { width: 768, height: 1024 },
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mobile.addCookies(await context.cookies());
  await mp.goto(base + "/admin");
  await expect(
    mp.getByRole("navigation", { name: "Admin tables" }),
  ).toBeVisible();
  await mp.getByRole("button", { name: "+ Add Row", exact: true }).click();
  await expect(
    mp.getByRole("heading", { name: "Create Organisations", exact: true }),
  ).toBeVisible();
  assert(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await mp.screenshot({
    path: "test-results/admin/editor-tablet.png",
    fullPage: true,
  });
  await mobile.close();
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  assert.equal((await page.request.get(base + "/api/admin/me")).status(), 401);
  // Owner-only customer danger action and final-organisation zero state.
  const member = await browser.newContext();
  const memberPage = await member.newPage();
  await customer(memberPage, "member");
  await memberPage.goto(base + "/settings/access");
  await expect(
    memberPage.getByText("You are a Member of Demo.", { exact: false }),
  ).toBeVisible();
  await expect(
    memberPage.getByRole("button", {
      name: "Delete Organisation",
      exact: true,
    }),
  ).toHaveCount(0);
  await member.close();
  await customer(page, "owner");
  await page.goto(base + "/settings/access");
  await page
    .getByRole("button", { name: "Delete Organisation", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete Organisation" });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete Organisation", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete Organisation", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("You don't belong to an organisation yet.", {
      exact: false,
    }),
  ).toBeVisible();
  assert.deepEqual(
    (await (await page.request.get(base + "/api/portal/organisations")).json())
      .organisations,
    [],
  );
  await page.screenshot({
    path: "test-results/admin/soft-delete-zero-org.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS canonical Admin login/table/editor/context/JSON fidelity/tablet + Owner soft delete/Member denial/zero-org browser acceptance",
  );
} finally {
  await browser?.close();
  runtime.kill("SIGTERM");
}
