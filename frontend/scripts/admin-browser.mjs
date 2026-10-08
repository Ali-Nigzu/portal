import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
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
const assertBrand = async (page) => {
  await expect(page).toHaveTitle("camOS");
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute("type", "image/svg+xml");
  const href = await icon.getAttribute("href");
  const response = await page.request.get(new URL(href, base).href);
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-type"], /image\/svg\+xml/);
  assert.equal(
    await response.text(),
    await readFile("src/assets/brand/camos-logo.svg", "utf8"),
  );
  assert(
    await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image.naturalWidth > 0 && image.naturalHeight > 0;
    }, href),
  );
};
const assertHomeEntry = async (context, authenticated) => {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://consent.cookiebot.com/**", (r) => r.abort());
  const sessions = (await context.cookies()).filter((c) =>
    ["camos_session", "camos_admin_session"].includes(c.name),
  );
  for (const entry of ["/", "/home"]) {
    await page.goto(base + entry);
    await expect(page).toHaveURL(base + "/home");
    await expect(
      page.locator(authenticated ? ".home-page" : ".landing-page"),
    ).toBeVisible();
    await expect(page.locator(".demo-overlay")).toHaveCount(0);
    await assertBrand(page);
    assert.deepEqual(
      (await context.cookies()).filter((c) =>
        sessions.some((s) => s.name === c.name),
      ),
      sessions,
    );
  }
  await page.close();
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
  const fresh = await browser.newContext();
  await assertHomeEntry(fresh, false);
  const freshPage = await fresh.newPage();
  await freshPage.goto(base + "/sites/organisations/1/dashboard");
  await expect(freshPage).toHaveURL(base + "/login");
  await assertBrand(freshPage);
  // Stored demo/organisation state must not determine launch destination or identity.
  await freshPage.evaluate(() => {
    sessionStorage.setItem("camOS_demo_session", "true");
    sessionStorage.setItem("camOS_selected_site", "123");
  });
  await freshPage.goto(base + "/");
  await expect(freshPage).toHaveURL(base + "/home");
  await expect(freshPage.locator(".landing-page")).toBeVisible();
  await expect(freshPage.locator(".demo-overlay")).toHaveCount(0);
  assert.equal((await freshPage.request.get(base + "/api/me")).status(), 401);
  await fresh.close();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://consent.cookiebot.com/**", (r) => r.abort());
  await page.goto(base + "/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await assertBrand(page);
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
  await assertBrand(page);
  await assertHomeEntry(context, false); // Valid Admin cookie, no customer cookie.
  assert.equal((await page.request.get(base + "/api/admin/me")).status(), 200);
  await page.goto(base + "/admin");
  await expect(
    page.getByRole("navigation", { name: "Admin tables" }),
  ).toBeVisible();
  const launchCustomer = await browser.newContext();
  const launchPage = await launchCustomer.newPage();
  await customer(launchPage, "owner");
  await assertHomeEntry(launchCustomer, true);
  await launchPage.goto(base + "/sites/organisations/1/dashboard");
  await expect(launchPage.locator(".dashboard-v2")).toBeVisible();
  await expect(launchPage).toHaveURL(base + "/sites/organisations/1/dashboard");
  await assertBrand(launchPage);
  await launchPage.goto(base + "/admin");
  await expect(launchPage).toHaveURL(base + "/admin/login");
  await launchCustomer.addCookies(
    (await context.cookies()).filter((c) => c.name === "camos_admin_session"),
  );
  await assertHomeEntry(launchCustomer, true); // Both independently proven cookies.
  assert.equal((await launchPage.request.get(base + "/api/me")).status(), 200);
  assert.equal(
    (await launchPage.request.get(base + "/api/admin/me")).status(),
    200,
  );
  await launchPage.goto(base + "/admin");
  await expect(
    launchPage.getByRole("navigation", { name: "Admin tables" }),
  ).toBeVisible();
  await launchCustomer.close();
  await expect(
    page.getByRole("navigation", { name: "Admin tables" }).getByRole("button"),
  ).toHaveCount(11);
  const registry = await (
    await page.request.get(base + "/api/admin/tables")
  ).json();
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
    const table = registry.tables.find(
      (t) => t.name.replaceAll("_", " ").toLowerCase() === name.toLowerCase(),
    );
    assert(table);
    await page.getByRole("button", { name: "+ Add Row", exact: true }).click();
    for (const column of table.columns.filter((c) => !c.identity)) {
      await expect(
        page
          .getByLabel(`${column.name} value mode`, { exact: true })
          .locator('option[value="now"]'),
      ).toHaveCount(column.type === "timestamptz" ? 1 : 0);
    }
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
  let tr = page.getByRole("row").filter({
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
  await page.getByLabel("ts value mode", { exact: true }).selectOption("now");
  await expect(page.locator("#field-ts")).toHaveCount(0);
  await page.getByLabel("ts value mode", { exact: true }).selectOption("value");
  await expect(page.locator("#field-ts")).toHaveValue(
    "2026-10-08T12:00:00.123456Z",
  );
  await page.getByLabel("ts value mode", { exact: true }).selectOption("now");
  await page
    .getByLabel("updated_at value mode", { exact: true })
    .selectOption("now");
  const createNow = page.waitForRequest(
    (r) =>
      r.method() === "POST" && r.url().endsWith("/tables/site_snapshots/rows"),
  );
  const beforeNow = Date.now();
  await page
    .locator("#field-payload")
    .fill('{"precise":12345678901234567890.1234567890123456789}');
  await page.locator("#field-state").fill("null");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const createIntent = (await createNow).postDataJSON();
  assert.deepEqual(createIntent.server_now, ["ts", "updated_at"]);
  assert(
    !("ts" in createIntent.values) && !("updated_at" in createIntent.values),
  );
  await expect(
    page.getByRole("button", { name: "Edit Site Snapshot", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Site Snapshot", exact: true })
    .click();
  await expect(page.locator("#field-payload")).toHaveValue(
    /12345678901234567890\.1234567890123456789/,
  );
  const persistedTs = await page.locator("#field-ts").inputValue();
  assert(
    Date.parse(persistedTs) >= beforeNow &&
      Date.parse(persistedTs) <= Date.now(),
  );
  await page
    .getByLabel("updated_at value mode", { exact: true })
    .selectOption("now");
  const updateNow = page.waitForRequest(
    (r) =>
      r.method() === "PUT" && r.url().endsWith("/tables/site_snapshots/row"),
  );
  await page.locator("#field-state").fill('{"updated":true}');
  await page.getByRole("button", { name: "Update", exact: true }).click();
  const updateIntent = (await updateNow).postDataJSON();
  assert.deepEqual(updateIntent.server_now, ["updated_at"]);
  assert(
    !("ts" in updateIntent.changes) && !("updated_at" in updateIntent.changes),
  );
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
  // Both customer scopes consume Admin-created snapshots on the next request.
  const dashboardContext = await browser.newContext();
  const dashboardPage = await dashboardContext.newPage();
  dashboardPage.on("pageerror", (e) => errors.push(e.message));
  await customer(dashboardPage, "owner");
  const siteResponse = await page.request.post(
    base + "/api/admin/tables/sites/rows",
    {
      headers,
      data: {
        values: {
          name: "Dashboard Acceptance",
          organisation_id: "1",
          max_capacity: 50,
        },
      },
    },
  );
  assert.equal(siteResponse.status(), 201);
  const dashboardSite = await siteResponse.json();
  for (const scope of ["organisation", "site"]) {
    const isSite = scope === "site";
    const table = isSite ? "site_snapshots" : "organisation_snapshots";
    const key = isSite
      ? { site_id: dashboardSite.id }
      : { organisation_id: "1" };
    const endpoint =
      base +
      "/api/portal/organisations/1" +
      (isSite ? `/sites/${dashboardSite.id}` : "") +
      "/snapshot";
    const route =
      base +
      "/sites/organisations/1" +
      (isSite ? `/sites/${dashboardSite.id}` : "") +
      "/dashboard";
    const absent = await dashboardPage.request.get(endpoint);
    assert.equal(absent.status(), 200);
    const payload = (await absent.json()).payload;
    assert.equal(payload.entrances_96[95], 0);
    payload.entrances_96[95] = 17;
    const created = await page.request.post(
      base + `/api/admin/tables/${table}/rows`,
      {
        headers,
        data: {
          values: { ...key, payload, state: {} },
          server_now: ["ts", "updated_at"],
        },
      },
    );
    assert.equal(created.status(), 201);
    const stored = await created.json();
    assert.equal(
      (await (await dashboardPage.request.get(endpoint)).json()).payload
        .entrances_96[95],
      17,
    );
    await dashboardPage.goto(route);
    await expect(dashboardPage.locator(".dashboard-v2")).toHaveAttribute(
      "data-snapshot-ts",
      stored.ts,
    );
    payload.entrances_96[95] = 29;
    const updated = await page.request.put(
      base + `/api/admin/tables/${table}/row`,
      {
        headers,
        data: { key, changes: { payload }, server_now: ["ts"] },
      },
    );
    assert.equal(updated.status(), 200);
    assert.equal(
      (await (await dashboardPage.request.get(endpoint)).json()).payload
        .entrances_96[95],
      29,
    );
    const invalid = await page.request.put(
      base + `/api/admin/tables/${table}/row`,
      {
        headers,
        data: { key, changes: { payload: {} } },
      },
    );
    assert.equal(invalid.status(), 200);
    const fallback = await dashboardPage.request.get(endpoint);
    assert.equal(fallback.status(), 200);
    assert.equal((await fallback.json()).payload.entrances_96[95], 0);
    await dashboardPage.reload();
    await expect(dashboardPage.locator(".dashboard-v2")).toBeVisible();
    const raw = await page.request.get(
      base + `/api/admin/tables/${table}/row?` + new URLSearchParams(key),
    );
    assert.deepEqual(await raw.json(), await invalid.json());
  }
  await dashboardContext.close();
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
    "PASS Home launch/cookie matrix + camOS favicon + canonical Admin + generic timestamp Now + Organisation/Site Dashboard persisted/update/invalid fallback + Owner soft delete/Member denial/zero-org browser acceptance",
  );
} finally {
  await browser?.close();
  runtime.kill("SIGTERM");
}
