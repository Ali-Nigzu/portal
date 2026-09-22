import assert from "node:assert/strict";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { fixture } from "./organisation-dashboard-tests.mjs";

const base = process.env.PORTAL_TEST_URL || "http://127.0.0.1:4182";
const n = (length, value) => Array.from({ length }, () => value);
const seq = (length, start = 1) =>
  Array.from({ length }, (_, index) => start + index);
const occupancy = (length, avg) =>
  Array.from({ length }, () => [avg, Math.max(avg - 2, 0), avg + 2]);
const rollup = (length, base) => [
  seq(length, base),
  occupancy(length, base + 10),
  seq(length, base + 2),
  [10, 20, 30, 25, 10, 5],
  [55, 45],
  [40, 35, 25],
];
const payload = (base, dwellValue = 7) => {
  const entrances96 = n(96, base);
  const exits96 = n(96, base + 1);
  const footfall96 = entrances96.map((value, index) => value + exits96[index]);
  return [
    entrances96,
    n(96, base + 20),
    exits96,
    footfall96,
    n(96, dwellValue),
    [30, 40, 30],
    [50, 70],
    rollup(24, base),
    rollup(24, base + 1),
    rollup(7, base + 2),
    rollup(4, base + 3),
    rollup(12, base + 4),
    rollup(12, base + 5),
    rollup(2, base + 6),
  ];
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.DASHBOARD_BROWSER_CHANNEL || "msedge",
});
const metadata = {
  organisation: {
    id: "77",
    name: "Example Organisation",
    slug: "example",
    enabled: true,
    realtime: true,
  },
  sites: [
    {
      id: "1",
      organisation_id: "77",
      name: "Renamed First",
      slug: "first",
      enabled: true,
      realtime: false,
      max_capacity: 5,
    },
    {
      id: "2",
      organisation_id: "77",
      name: "Renamed Second",
      slug: "second",
      enabled: false,
      realtime: true,
      max_capacity: 8,
    },
    {
      id: "9007199254740993",
      organisation_id: "77",
      name: "Third Site",
      slug: "third",
      enabled: true,
      realtime: false,
      max_capacity: 2,
    },
  ],
  sources: [
    {
      ref: "device:101",
      kind: "device",
      site_id: "1",
      label: "Front Door",
      analyzed_until: "2026-09-20T09:00:00Z",
    },
    {
      ref: "gateway:1",
      kind: "gateway",
      site_id: "1",
      label: "Gateway 1",
      analyzed_until: null,
    },
    {
      ref: "device:202",
      kind: "device",
      site_id: "2",
      label: "Front Door",
      analyzed_until: null,
    },
    {
      ref: "gateway:2",
      kind: "gateway",
      site_id: "2",
      label: "Gateway 2",
      analyzed_until: null,
    },
  ],
  clock: {
    server_now: "2026-09-20T10:00:00Z",
    effective_now: "2026-09-20T10:00:00Z",
    time_zone: "Europe/London",
  },
};
const modules = [
  "dashboard",
  "event-logs",
  "alarm-logs",
  "device-list",
  "reports",
];
let passed = 0;
async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
async function harness(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const requests = [];
  const errors = [];
  const state = { fail: false, hold: false, release: null };
  await context.route("https://consent.cookiebot.com/**", (r) => r.abort());
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const site = url.searchParams.get("site_id");
    const scope = { organisation_id: "77", site_id: site };
    let body = { ok: false };
    if (url.pathname === "/api/demo/portal/context") body = metadata;
    if (url.pathname === "/api/demo/dashboard/snapshot")
      body = fixture("organisation", "77");
    if (url.pathname.startsWith("/api/demo/dashboard/sites/"))
      body = fixture("site", url.pathname.split("/")[5]);
    if (url.pathname === "/api/demo/portal/events") {
      if (state.hold && site === "2") {
        state.hold = false;
        await new Promise((resolve) => (state.release = resolve));
      }
      if (state.fail) {
        await route.fulfill({
          status: 503,
          json: { detail: { message: "Event source unavailable" } },
        });
        return;
      }
      body = {
        scope,
        total: 1,
        page: { size: 20, next_cursor: null },
        items: [
          {
            event_id: "00000000-0000-4000-8000-123456789012",
            site: {
              id: site ?? "1",
              name: site === "2" ? "Renamed Second" : "Renamed First",
            },
            source: {
              ref: site === "2" ? "device:202" : "device:101",
              kind: "device",
              label: "Front Door",
            },
            timestamp: "2026-09-20T09:00:00Z",
            event: { value: "entrance", label: "Entrance" },
            sex: { value: "male", label: "Male" },
            age: { value: "26-45", label: "26–45" },
          },
        ],
      };
    }
    if (url.pathname === "/api/demo/portal/alarms") {
      const offset = Number(url.searchParams.get("cursor") || 0);
      const count = url.searchParams.has("severity") ? 3 : 25;
      const alarm = (i) => ({
        id: String(i),
        site: {
          id: site ?? "1",
          name: site === "2" ? "Renamed Second" : "Renamed First",
        },
        source: {
          ref: `gateway:${site ?? 1}`,
          kind: "gateway",
          label: `Gateway ${site ?? 1}`,
        },
        type: { code: "connection_lost", label: "Connection lost" },
        severity: "high",
        status: "cleared",
        started_at: "2026-09-20T09:00:00Z",
        cleared_at: "2026-09-20T09:30:00Z",
      });
      body = {
        scope,
        counts: { active: 2, cleared: count },
        active: {
          items: [{ ...alarm(99), status: "active", cleared_at: null }],
        },
        cleared: {
          items: Array.from(
            { length: Math.max(0, Math.min(10, count - offset)) },
            (_, i) => alarm(offset + i),
          ),
          next_cursor: offset + 10 < count ? String(offset + 10) : null,
          has_more: offset + 10 < count,
        },
      };
    }
    if (url.pathname === "/api/demo/portal/events/export") {
      await route.fulfill({
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="events.csv"' },
        body: "Event ID,Site,Source\r\nuuid,Site,Front Door\r\n",
      });
      return;
    }
    if (url.pathname === "/api/demo/portal/reports/snapshot") {
      if (site !== "9007199254740993") {
        await route.fulfill({
          json: {
            scope,
            ts: "2026-09-20T09:00:00Z",
            mode: "snapshots",
            fallback: false,
            payload: payload(2),
          },
        });
        return;
      }
      await route.fulfill({
        status: 404,
        json: { detail: { message: "Reports unavailable for this site" } },
      });
      return;
    }
    try {
      await route.fulfill({ json: body });
    } catch (error) {
      if (!String(error).includes("closed")) throw error;
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  return { context, page, requests, errors, state };
}
try {
  const h = await harness();
  const { page, requests } = h;
  await check(
    "bare demo selects configured Site 2 without wrong Snapshot",
    async () => {
      await page.goto(base + "/demo");
      await expect(page).toHaveURL(base + "/demo/example/second/dashboard");
      await expect(page.locator("[data-snapshot-ts]")).toBeVisible();
      assert(!requests.some((r) => r.includes("/sites/1/snapshot")));
    },
  );
  for (const module of modules)
    await check(
      `site switch preserves ${module} and canonical links`,
      async () => {
        await page.goto(`${base}/demo/example/second/${module}?panel=sites`);
        await page
          .getByRole("link", { name: "Renamed First", exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`/example/first/${module}`));
        for (const [label, target] of [
          ["Dashboard", "dashboard"],
          ["Event Logs", "event-logs"],
          ["Alarm Logs", "alarm-logs"],
          ["Device List", "device-list"],
          ["Reports", "reports"],
        ])
          await expect(
            page.getByRole("link", { name: label, exact: true }),
          ).toHaveAttribute("href", `/demo/example/first/${target}`);
        await page
          .getByRole("button", { name: "Renamed First", exact: true })
          .click();
        await page
          .getByRole("link", { name: "Renamed Second", exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`/example/second/${module}`));
      },
    );
  await check(
    "organisation survives navigation and groups Sources",
    async () => {
      await page.goto(base + "/demo/example/event-logs");
      await expect(
        page.getByRole("heading", { name: "Event Logs", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sources", exact: true }).click();
      await expect(page.locator(".portal-source-group")).toHaveText([
        "Renamed First",
        "Renamed Second",
      ]);
      await expect(
        page.getByRole("option", { name: "Front Door", exact: true }),
      ).toHaveCount(2);
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "Alarm Logs", exact: true }).click();
      await expect(page).toHaveURL(base + "/demo/example/alarm-logs");
      assert(
        requests
          .filter((r) => r.startsWith("/api/demo/portal/alarms"))
          .at(-1)
          .includes("site_id=") === false,
      );
    },
  );
  await check(
    "alarms ten then twenty then twenty-five, counts unchanged",
    async () => {
      await expect(
        page.locator("section").nth(1).locator("tbody tr"),
      ).toHaveCount(10);
      await expect(page.locator(".portal-log-counts strong").nth(1)).toHaveText(
        "25",
      );
      await page
        .getByRole("button", { name: "Show more", exact: true })
        .click();
      await expect(
        page.locator("section").nth(1).locator("tbody tr"),
      ).toHaveCount(20);
      await page
        .getByRole("button", { name: "Show more", exact: true })
        .click();
      await expect(
        page.locator("section").nth(1).locator("tbody tr"),
      ).toHaveCount(25);
      await expect(
        page.getByRole("button", { name: "Show more", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".portal-log-counts strong").nth(1)).toHaveText(
        "25",
      );
      assert.equal(
        await page
          .getByRole("button", { name: /Clear All|Export CSV|Details/ })
          .count(),
        0,
      );
    },
  );
  await check("alarm filter clears old continuation", async () => {
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await page.getByLabel("Severity", { exact: true }).selectOption("high");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(
      page.locator("section").nth(1).locator("tbody tr"),
    ).toHaveCount(3);
    const last = requests
      .filter((r) => r.startsWith("/api/demo/portal/alarms"))
      .at(-1);
    assert(last.includes("severity=high") && !last.includes("cursor="));
  });
  await check(
    "delayed old site response cannot overwrite new scope",
    async () => {
      h.state.hold = true;
      await page.goto(base + "/demo/example/second/event-logs?panel=sites");
      await expect.poll(() => Boolean(h.state.release)).toBe(true);
      await page
        .getByRole("link", { name: "Renamed First", exact: true })
        .click();
      await expect(page.locator("tbody")).toContainText("Renamed First");
      h.state.release();
      await expect(page.locator("tbody")).not.toContainText("Renamed Second");
    },
  );
  await check("event outage is an error, not zero", async () => {
    h.state.fail = true;
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Event source unavailable",
    );
    await expect(
      page.getByText("No events match these filters.", { exact: true }),
    ).toHaveCount(0);
    h.state.fail = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });
  await check("scoped server CSV download", async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    assert.equal((await download).suggestedFilename(), "events.csv");
    const request = requests
      .filter((r) => r.startsWith("/api/demo/portal/events/export"))
      .at(-1);
    assert(request.includes("site_id=1") && request.includes("effective_now="));
  });
  await check(
    "Reports downloads both existing PDF types with canonical scope",
    async () => {
      await page.goto(base + "/demo/example/first/reports");
      for (const type of ["site-activity", "visitor-profile"]) {
        await page.locator("select").first().selectOption(type);
        const download = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Download Report", exact: true })
          .click();
        const result = await download;
        assert(result.suggestedFilename().endsWith(".pdf"));
        const stream = await result.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), "%PDF-");
        assert(
          requests
            .filter((r) => r.startsWith("/api/demo/portal/reports/snapshot"))
            .at(-1)
            .includes("site_id=1"),
        );
      }
      await page.goto(base + "/demo/example/third/reports");
      await page
        .getByRole("button", { name: "Download Report", exact: true })
        .click();
      await expect(
        page.getByText("Reports unavailable for this site", { exact: true }),
      ).toBeVisible();
    },
  );
  await check(
    "Devices uses scoped metadata without fabricated status or extra requests",
    async () => {
      const before = requests.length;
      await page.goto(base + "/demo/example/first/device-list");
      await expect(page.locator("tbody tr")).toHaveCount(2);
      await expect(page.locator("tbody")).toContainText("Gateway 1");
      await expect(page.locator("tbody")).not.toContainText("Gateway 2");
      assert(
        !requests
          .slice(before)
          .some((r) => /\/events|\/alarms|\/snapshot/.test(r)),
      );
      await page.goto(base + "/demo/example/third/device-list");
      await expect(
        page.getByText("No sources in this scope.", { exact: true }),
      ).toBeVisible();
    },
  );
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet", { width: 768, height: 1024 }],
    ["phone", { width: 390, height: 844 }],
  ])
    await check(
      `canonical UUID and read-only alarm layout ${name}`,
      async () => {
        await page.setViewportSize(viewport);
        await page.goto(base + "/demo/example/first/event-logs");
        await expect(page.locator(".portal-event-id")).toHaveText(
          "00000000-0000-4000-8000-123456789012",
        );
        assert.equal(await page.getByText(/Race|Track ID/).count(), 0);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
          ),
          false,
        );
        await page.screenshot({
          path: `test-results/portal-events-${name}.png`,
          fullPage: true,
        });
        await page.goto(base + "/demo/example/first/alarm-logs");
        await expect(
          page.locator("section").nth(1).locator("tbody tr"),
        ).toHaveCount(10);
        await expect(page.locator("section").nth(1)).toContainText("Gateway 1");
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
          ),
          false,
        );
        await page.screenshot({
          path: `test-results/portal-alarms-${name}.png`,
          fullPage: true,
        });
      },
    );
  assert.deepEqual(h.errors, []);
  await h.context.close();
  console.log(`Portal browser scenarios: ${passed} passed, 0 failed.`);
} finally {
  await browser.close();
}
