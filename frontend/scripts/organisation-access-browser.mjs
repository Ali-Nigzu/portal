import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { expect } from "@playwright/test";

// Real canonical API + a disposable localhost database. No route stubs for the
// happy path, no product test-user endpoint, and no GCP access.
const base = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const runtime = spawn(
  process.env.PORTAL_TEST_PYTHON ?? "python",
  ["-m", "backend.tests.run_membership_browser"],
  {
    cwd: path.resolve(".."),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let runtimeLog = "";
runtime.stdout.on("data", (data) => {
  runtimeLog += data;
});
runtime.stderr.on("data", (data) => {
  runtimeLog += data;
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
const errors = [];
const pages = [];
const output = "test-results/organisation-access";

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (runtime.exitCode !== null) throw new Error(runtimeLog);
    try {
      ready = (await fetch("http://127.0.0.1:8000/api/me")).status === 401;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  assert(ready, `Local canonical backend failed to start: ${runtimeLog}`);
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PORTAL_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PORTAL_BROWSER_EXECUTABLE }
      : {}),
  });
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const memberContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const thirdContext = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  });
  const owner = await ownerContext.newPage(),
    member = await memberContext.newPage(),
    third = await thirdContext.newPage();
  pages.push(owner, member, third);
  for (const page of [owner, member, third]) {
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://consent.cookiebot.com/**", (route) =>
      route.abort(),
    );
  }
  async function apiLogin(page, identifier) {
    const response = await page.request.post(`${base}/api/login`, {
      headers: { "X-Requested-With": "camOS" },
      data: { identifier, password: "canonical-browser-test" },
    });
    assert.equal(response.status(), 200);
    await page.goto(`${base}/home`);
    await expect(page.getByTestId("authenticated-app-shell")).toBeVisible();
  }
  async function primary(page) {
    const nav = page.locator(".authenticated-navigation__primary");
    if (await nav.isVisible()) return nav;
    if (
      await page.locator(".authenticated-navigation__rail-trigger").isVisible()
    )
      await page.locator(".authenticated-navigation__rail-trigger").click();
    if (!(await nav.isVisible())) {
      const change = page.getByRole("button", { name: /^Change scope for/ });
      if (await change.isVisible()) await change.click();
      await page
        .getByRole("button", { name: "Back to primary navigation" })
        .click();
    }
    await expect(nav).toBeVisible();
    return nav;
  }
  async function create(page, name) {
    await (await primary(page))
      .getByRole("button", { name: "Add Organisation", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Create organisation",
      exact: true,
    });
    await expect(dialog.getByLabel("Organisation name")).toBeFocused();
    await expect(
      dialog.getByRole("button", { name: "Create organisation", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("Organisation name").fill("   ");
    await expect(
      dialog.getByRole("button", { name: "Create organisation", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("Organisation name").fill(name);
    let submissions = 0;
    const creationURL = "**/api/portal/organisations";
    const holdCreation = async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submissions += 1;
      await delay(400);
      await route.fulfill({ response: await route.fetch() });
    };
    await page.route(creationURL, holdCreation);
    await dialog
      .getByRole("button", { name: "Create organisation", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Creating…", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await dialog.locator("form").dispatchEvent("submit");
    await expect(dialog).toHaveCount(0);
    await page.unroute(creationURL, holdCreation);
    assert.equal(
      submissions,
      1,
      "Repeated submission must not create a second organisation",
    );
    await expect(page).toHaveURL(/\/sites\/organisations\/[0-9]+\/dashboard$/);
    const id = /organisations\/([0-9]+)/.exec(page.url())[1];
    await expect(page.getByRole("alert")).toHaveCount(0);
    await (await primary(page))
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Settings navigation", exact: true })
      .getByRole("button", { name: "Manage Access", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/settings/access\\?organisation_id=${id}$`),
    );
    return id;
  }
  async function settings(page, id) {
    await page.goto(
      `${base}/settings/access${id ? `?organisation_id=${id}` : ""}`,
    );
    await expect(
      page.getByRole("heading", { name: "Manage Access", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Your invitations and requests",
        exact: true,
      }),
    ).toHaveCount(0);
    for (const action of ["+ Add Organisation", "+ Request Access"])
      await expect(
        page
          .locator(".access-page-actions")
          .getByRole("button", { name: action, exact: true }),
      ).toBeVisible();
  }
  async function sendInvite(page, identifier, type = "Email") {
    const selectedId = await page
      .locator(".access-organisation-id strong")
      .innerText();
    await page
      .getByRole("button", { name: "Invite member", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Invite member",
      exact: true,
    });
    const selector = dialog.getByRole("combobox", {
      name: "Organisation",
      exact: true,
    });
    await expect(selector).toHaveValue(selectedId);
    const catalogue = await (
      await page.request.get(`${base}/api/portal/organisations`)
    ).json();
    assert.deepEqual(
      await selector
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value)),
      catalogue.organisations
        .filter((org) => org.role === 0)
        .map((org) => org.id),
    );
    await expect(
      dialog.getByRole("textbox", { name: "Email", exact: true }),
    ).toBeFocused();
    if (type === "Username")
      await dialog
        .getByRole("radio", { name: "Username", exact: true })
        .check();
    await dialog
      .getByRole("textbox", { name: type, exact: true })
      .fill(identifier);
    await expect(dialog.getByRole("combobox")).toHaveCount(1);
    await dialog
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    return dialog;
  }
  const personalRow = (page, name) =>
    page.locator(".access-personal-row").filter({ hasText: name });
  async function requestAccess(page, id) {
    await page
      .locator(".access-page-actions")
      .getByRole("button", { name: "+ Request Access", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Request access",
      exact: true,
    });
    await dialog.getByLabel("Organisation ID", { exact: true }).fill(id);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Request access", exact: true })
      .click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
  }

  // Existing canonical login, normal shell, zero organisation navigation.
  await owner.goto(`${base}/login`);
  await owner.getByLabel("Email or username", { exact: true }).fill("owner");
  await owner.getByRole("button", { name: "Continue", exact: true }).click();
  await owner
    .getByLabel("Password", { exact: true })
    .fill("canonical-browser-test");
  await owner.getByRole("button", { name: "Login", exact: true }).click();
  await expect(owner).toHaveURL(/\/home$/);
  await apiLogin(member, "member");
  await apiLogin(third, "third");
  const zero = await primary(member);
  await expect(
    zero.getByRole("button", { name: "Add Organisation", exact: true }),
  ).toBeVisible();
  await expect(
    zero.getByRole("button", { name: "Request Access", exact: true }),
  ).toBeVisible();
  for (const name of ["Home", "Documents", "Settings", "Logout"])
    await expect(zero.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(member.locator(".home-page")).not.toContainText(
    "Organisation access",
  );

  // Modal keyboard containment and Escape return focus.
  await zero
    .getByRole("button", { name: "Add Organisation", exact: true })
    .click();
  let modal = member.getByRole("dialog", {
    name: "Create organisation",
    exact: true,
  });
  await expect(modal.getByLabel("Organisation name")).toBeFocused();
  await member.keyboard.press("Shift+Tab");
  assert(
    await member.evaluate(
      () => !!document.activeElement.closest('[role="dialog"]'),
    ),
  );
  await member.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  assert(await member.evaluate(() => document.activeElement !== document.body));
  assert(await member.evaluate(() => !document.querySelector("#root").inert));
  await settings(member);
  await member
    .locator(".access-page-actions")
    .getByRole("button", { name: "+ Add Organisation", exact: true })
    .click();
  await expect(
    member.getByRole("dialog", { name: "Create organisation", exact: true }),
  ).toBeVisible();
  await member.keyboard.press("Escape");
  await member
    .locator(".access-page-actions")
    .getByRole("button", { name: "+ Request Access", exact: true })
    .click();
  await expect(
    member.getByRole("dialog", { name: "Request access", exact: true }),
  ).toBeVisible();
  await member.keyboard.press("Escape");

  const orgA = await create(owner, "Atlas Retail");
  assert.equal(orgA, "900000000000000101");
  // A transient storage failure must show loading and retry without inventing a roster.
  const accessURL = `**/api/portal/organisations/${orgA}/access`;
  let releaseAccess;
  const heldAccess = new Promise((resolve) => {
    releaseAccess = resolve;
  });
  const failAccess = async (route) => {
    await heldAccess;
    await route
      .fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            error: "storage_unavailable",
            message:
              "Access service is temporarily unavailable. Please try again.",
          },
        }),
      })
      .catch(() => {});
  };
  await owner.route(accessURL, failAccess);
  await settings(owner, orgA);
  await expect(
    owner.getByText("Loading organisation access…", { exact: true }),
  ).toBeVisible();
  releaseAccess();
  await expect(owner.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    owner.getByRole("region", { name: "Members", exact: true }),
  ).toHaveCount(0);
  await owner.unroute(accessURL, failAccess);
  await owner.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(owner.locator(".access-organisation-id")).toContainText(orgA);
  await owner.getByRole("button", { name: "Copy Organisation ID" }).click();
  await expect(
    owner.getByRole("button", { name: "Copy Organisation ID" }),
  ).toContainText("Copied");
  assert.equal(
    await owner.evaluate(() => navigator.clipboard.readText()),
    orgA,
  );
  await expect(
    owner.getByRole("region", { name: "Members", exact: true }),
  ).toContainText("Owner");
  await expect(
    owner.getByRole("columnheader", { name: "Site", exact: true }),
  ).toHaveCount(0);
  await expect(
    owner.getByText("No pending invitations", { exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByText("No access requests", { exact: true }),
  ).toBeVisible();

  modal = await sendInvite(owner, "MEMBER@EXAMPLE.COM");
  await expect(modal).toHaveCount(0);
  await expect(
    owner.getByRole("region", { name: "Pending invitations", exact: true }),
  ).toContainText("member@example.com");
  await settings(member);
  await expect(personalRow(member, "Atlas Retail")).toContainText(
    "Invited you to join",
  );
  const incoming = member.getByRole("region", {
    name: "Pending invitations",
    exact: true,
  });
  await expect(incoming).toContainText(`Organisation ID ${orgA}`);
  await expect(
    incoming.getByRole("button", { name: "Accept", exact: true }),
  ).toBeVisible();
  await expect(
    incoming.getByRole("button", { name: "Withdraw", exact: true }),
  ).toHaveCount(0);
  assert.equal(
    (
      await member.request.get(
        `${base}/api/portal/organisations/${orgA}/context`,
      )
    ).status(),
    404,
  );
  await personalRow(member, "Atlas Retail")
    .getByRole("button", { name: "Accept", exact: true })
    .click();
  await expect(personalRow(member, "Atlas Retail")).toHaveCount(0);
  await expect(member.locator("main")).toContainText(
    "You are a Member of Atlas Retail.",
  );
  await expect(
    member.getByRole("button", { name: "Invite member", exact: true }),
  ).toHaveCount(0);
  assert.equal(
    (
      await member.request.get(
        `${base}/api/portal/organisations/${orgA}/context`,
      )
    ).status(),
    200,
  );
  await settings(owner, orgA);
  await expect(
    owner.getByRole("region", { name: "Members", exact: true }),
  ).toContainText("member@example.com");

  // Unknown user produces real server error + existing authenticated Contact route.
  modal = await sendInvite(owner, "nonexistent@example.com");
  await expect(modal.getByRole("alert")).toContainText(
    "doesn't have a camOS account yet",
  );
  await modal.getByRole("link", { name: "contact us", exact: true }).click();
  await expect(owner).toHaveURL(/\/contact$/);
  await expect(
    owner.getByRole("heading", { name: "Get in Touch", exact: true }),
  ).toBeVisible();
  await settings(owner, orgA);
  modal = await sendInvite(owner, "third", "Username");
  await expect(modal).toHaveCount(0);
  await settings(third);
  await personalRow(third, "Atlas Retail")
    .getByRole("button", { name: "Decline", exact: true })
    .click();
  await expect(personalRow(third, "Atlas Retail")).toHaveCount(0);
  assert.equal(
    (
      await third.request.get(
        `${base}/api/portal/organisations/${orgA}/context`,
      )
    ).status(),
    404,
  );

  const orgB = await create(member, "Warehouse Co");
  await settings(member, orgB);
  await expect(
    member.getByRole("combobox", { name: "Organisation", exact: true }),
  ).toHaveValue(orgB);
  await expect(
    member.getByRole("button", { name: "Invite member", exact: true }),
  ).toBeVisible();
  await settings(owner, orgA);
  await owner
    .getByRole("button", { name: "+ Request Access", exact: true })
    .click();
  modal = owner.getByRole("dialog", { name: "Request access", exact: true });
  await modal
    .getByLabel("Organisation ID", { exact: true })
    .fill("9223372036854775808");
  await expect(
    modal.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await modal.getByLabel("Organisation ID", { exact: true }).fill("9999");
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "Organisation unavailable",
  );
  await modal.getByLabel("Organisation ID", { exact: true }).fill(orgB);
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(modal).toContainText("Warehouse Co");
  await expect(
    modal.getByRole("heading", { name: "Warehouse Co", exact: true }),
  ).toBeFocused();
  await expect(modal).toContainText(orgB);
  await modal.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    modal.getByLabel("Organisation ID", { exact: true }),
  ).toHaveValue(orgB);
  await expect(
    modal.getByLabel("Organisation ID", { exact: true }),
  ).toBeFocused();
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await modal
    .getByRole("button", { name: "Request access", exact: true })
    .click();
  await expect(
    owner.getByRole("dialog", { name: "Request sent", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByRole("button", { name: "Done", exact: true }),
  ).toBeFocused();
  await owner.getByRole("button", { name: "Done", exact: true }).click();
  await expect(personalRow(owner, "Warehouse Co")).toContainText(
    "Pending approval",
  );
  await expect(
    owner.getByRole("region", { name: "Access requests", exact: true }),
  ).toContainText(`Organisation ID ${orgB}`);
  await expect(
    owner.getByRole("region", { name: "Pending invitations", exact: true }),
  ).not.toContainText("Warehouse Co");
  // An Owner's incoming requests and their own outgoing request share one section.
  await settings(third);
  await requestAccess(third, orgA);
  await settings(owner, orgA);
  const requests = owner.getByRole("region", {
    name: "Access requests",
    exact: true,
  });
  await expect(
    requests.getByRole("heading", {
      name: "Requests to Atlas Retail",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    requests.getByRole("heading", { name: "Your requests", exact: true }),
  ).toBeVisible();
  await expect(
    requests.getByRole("button", { name: "Approve third", exact: true }),
  ).toBeVisible();
  await expect(requests.locator(".access-personal-row")).toContainText(
    "Warehouse Co",
  );
  await expect(
    requests.locator(".access-personal-row").getByRole("button"),
  ).toHaveCount(0);
  await requests
    .getByRole("button", { name: "Decline request from third", exact: true })
    .click();
  await expect(
    requests.getByRole("button", { name: "Approve third", exact: true }),
  ).toHaveCount(0);
  assert.equal(
    (
      await owner.request.get(
        `${base}/api/portal/organisations/${orgB}/context`,
      )
    ).status(),
    404,
  );
  await settings(member, orgB);
  await member
    .getByRole("button", { name: "Approve owner", exact: true })
    .click();
  await expect(
    member.getByRole("region", { name: "Members", exact: true }),
  ).toContainText("owner@example.com");
  await owner.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(personalRow(owner, "Warehouse Co")).toHaveCount(0);
  assert.equal(
    (
      await owner.request.get(
        `${base}/api/portal/organisations/${orgB}/context`,
      )
    ).status(),
    200,
  );

  // Request decline, invitation withdrawal, and canonical disabled state.
  await settings(third);
  await third
    .getByRole("button", { name: "+ Request Access", exact: true })
    .click();
  modal = third.getByRole("dialog", { name: "Request access", exact: true });
  await modal.getByLabel("Organisation ID", { exact: true }).fill(orgB);
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await modal
    .getByRole("button", { name: "Request access", exact: true })
    .click();
  await third.getByRole("button", { name: "Done", exact: true }).click();
  await settings(member, orgB);
  await member
    .getByRole("button", { name: "Decline request from third", exact: true })
    .click();
  await expect(
    member.getByRole("button", {
      name: "Decline request from third",
      exact: true,
    }),
  ).toHaveCount(0);
  modal = await sendInvite(member, "third", "Username");
  await expect(modal).toHaveCount(0);
  // Invite into another Owner organisation without changing the page's scope.
  await settings(owner, orgA);
  const accessURLBeforeInvite = owner.url();
  await owner
    .getByRole("button", { name: "Invite member", exact: true })
    .click();
  modal = owner.getByRole("dialog", { name: "Invite member", exact: true });
  const inviteOrganisation = modal.getByRole("combobox", {
    name: "Organisation",
    exact: true,
  });
  await expect(inviteOrganisation).toHaveValue(orgA);
  await inviteOrganisation.selectOption("1");
  await expect(owner).toHaveURL(accessURLBeforeInvite);
  await modal
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("member@example.com");
  const submittedInvite = owner.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        "/api/portal/organisations/1/invitations",
  );
  await modal
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  assert.deepEqual((await submittedInvite).postDataJSON(), {
    identifier_type: "email",
    identifier: "member@example.com",
  });
  await expect(modal).toHaveCount(0);
  await expect(owner).toHaveURL(accessURLBeforeInvite);
  await expect(
    owner.getByRole("combobox", { name: "Organisation", exact: true }),
  ).toHaveValue(orgA);
  assert(
    (
      await (
        await owner.request.get(`${base}/api/portal/organisations/1/access`)
      ).json()
    ).invitations.some((invitation) => invitation.user_id === "1"),
  );
  await member.evaluate(() => window.dispatchEvent(new Event("focus")));
  const invitations = member.getByRole("region", {
    name: "Pending invitations",
    exact: true,
  });
  await expect(
    invitations.getByRole("heading", {
      name: "Sent for Warehouse Co",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    invitations.getByRole("heading", {
      name: "Invitations for you",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    invitations.getByRole("button", {
      name: "Withdraw invitation for third",
      exact: true,
    }),
  ).toBeVisible();
  await expect(personalRow(member, "Demo")).toContainText("Organisation ID 1");
  await personalRow(member, "Demo")
    .getByRole("button", { name: "Decline", exact: true })
    .click();
  await expect(personalRow(member, "Demo")).toHaveCount(0);
  await member
    .getByRole("button", { name: "Withdraw invitation for third", exact: true })
    .click();
  await member
    .getByRole("dialog", { name: "Withdraw invitation", exact: true })
    .getByRole("button", { name: "Withdraw invitation", exact: true })
    .click();
  await expect(
    member.getByRole("button", {
      name: "Withdraw invitation for third",
      exact: true,
    }),
  ).toHaveCount(0);
  await settings(owner, orgA);
  await owner
    .getByRole("button", { name: "Disable member", exact: true })
    .click();
  await owner
    .getByRole("dialog", { name: "Disable member access", exact: true })
    .getByRole("button", { name: "Disable access", exact: true })
    .click();
  await expect(
    owner.getByRole("region", { name: "Members", exact: true }),
  ).not.toContainText("member@example.com");
  assert.equal(
    (
      await member.request.get(
        `${base}/api/portal/organisations/${orgA}/context`,
      )
    ).status(),
    404,
  );
  await member.goto(`${base}/sites/organisations/${orgA}/dashboard`);
  await expect(member).toHaveURL(/\/home$/);

  // Session restoration and full empty-resource product paths.
  await apiLogin(member, "member");
  const catalogue = await (
    await member.request.get(`${base}/api/portal/organisations`)
  ).json();
  assert.deepEqual(
    catalogue.organisations.map((org) => org.id),
    [orgB],
  );
  for (const module of [
    "dashboard",
    "event-logs",
    "alarm-logs",
    "device-list",
    "reports",
  ]) {
    await member.goto(`${base}/sites/organisations/${orgB}/${module}`);
    await expect(member.getByRole("alert")).toHaveCount(0);
    await expect(
      member.locator(".authenticated-portal-scope-header"),
    ).toBeVisible();
  }
  await settings(owner, orgA);
  await settings(member, orgB);
  await settings(third);
  await owner.screenshot({
    path: `${output}/owner-desktop.png`,
    fullPage: true,
  });
  await member.screenshot({
    path: `${output}/owner-phone.png`,
    fullPage: true,
  });
  await third.screenshot({
    path: `${output}/zero-org-tablet.png`,
    fullPage: true,
  });
  for (const page of [owner, member, third])
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Page must not overflow horizontally",
    );
  assert.deepEqual(errors, []);
  console.log(
    "PASS real PostgreSQL browser acceptance: desktop/phone/tablet, two-user organisation workflows, existing login, pending isolation, declines/withdraw/disable, ID copy, Contact, keyboard dialogs and zero-site Portal modules.",
  );
} catch (error) {
  for (const [index, page] of pages.entries()) {
    await page
      .screenshot({ path: `${output}/failure-${index}.png`, fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  if (runtime.exitCode === null) {
    runtime.kill("SIGTERM");
    await Promise.race([once(runtime, "exit"), delay(5000)]);
    if (runtime.exitCode === null) runtime.kill("SIGKILL");
  }
  if (runtimeLog.includes("Traceback")) console.error(runtimeLog);
}
