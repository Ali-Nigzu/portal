import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { fixture } from "./organisation-dashboard-tests.mjs";

// Uses controlled authenticated APIs, real shared components and real downloads.
// pdftotext (Poppler) verifies document content, rather than just a download event.
const base = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const out = path.resolve("test-results/authenticated-zero-data");
await mkdir(out, { recursive: true });
const anchor = "2026-01-02T12:00:00Z";
const orgs = [
  { id: "900000000000000101", name: "Empty Org", role: 0, sites: [] },
  { id: "27", name: "One Site Org", role: 0, sites: [{ id: "42", name: "New Site" }] },
  { id: "28", name: "Many Sites Org", role: 0, sites: [{ id: "43", name: "First Site" }, { id: "44", name: "Second Site" }] },
  { id: "29", name: "Populated Org", role: 0, sites: [{ id: "45", name: "Populated Site" }] },
];
const periods = ["today", "yesterday", "last_week", "last_month", "last_quarter", "last_year", "all_time"];
const labels = ["Today", "Yesterday", "Last Week", "Last Month", "Last Quarter", "Last Year", "All Time"];
function snapshot(org, site, populated = false, known = true) {
  const s = fixture(site ? "site" : "organisation", site?.id ?? org.id);
  s.entity_name = site?.name ?? org.name;
  s.ts = anchor;
  if (!populated) {
    for (const [key, value] of Object.entries(s.payload)) {
      if (key === "traffic_devices") continue;
      const zeros = value => Array.isArray(value) ? value.map(zeros) : typeof value === "number" ? 0 : value;
      s.payload[key] = Array.isArray(value) ? zeros(value) : Object.fromEntries(Object.entries(value).map(([k,v]) => [k, zeros(v)]));
    }
    s.payload.all_time = { ...s.payload.all_time, entrances: [0], exits: [0], occupancy: [[0,0,0]] };
  }
  s.payload.traffic_devices = known
    ? site ? [{ device_id: "900000000000000201", name: "Real Camera" }]
      : org.sites.map(item => ({ site_id: item.id, name: item.name }))
    : [];
  s.payload.traffic_split_96 = Array.from({ length: 96 }, () => s.payload.traffic_devices.map(() => populated ? 100 : 0));
  return s;
}
const contextFor = org => ({
  organisation: { ...org, slug: org.name.toLowerCase().replaceAll(" ", "-"), enabled: true, realtime: false },
  sites: org.sites.map(site => ({ ...site, organisation_id: org.id, slug: site.name.toLowerCase().replaceAll(" ", "-"), enabled: true, realtime: false, max_capacity: 10 })),
  sources: [],
  clock: { server_now: anchor, effective_now: anchor, time_zone: "Europe/London" },
});
const browser = await chromium.launch({ headless: true });
let checks = 0, downloads = 0;
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const state = { reportFailure: null, deviceFailure: false, deviceCount: 0, holdDevices: false, releaseDevices: null, holdReport: false, releaseReport: null, staleScope: false };
const requests = [];
await page.route("https://consent.cookiebot.com/**", route => route.abort());
await page.route("**/api/**", async route => {
  const url = new URL(route.request().url()), p = url.pathname;
  requests.push({ path: p, search: url.search, method: route.request().method() });
  if (p === "/api/me") return route.fulfill({ json: { user: { id: "1", name: "Tester", email: "tester@example.com" } } });
  if (p === "/api/portal/organisations") return route.fulfill({ json: { organisations: orgs } });
  const match = /^\/api\/portal\/organisations\/(\d+)(.*)$/.exec(p);
  if (!match) return route.fulfill({ json: {} });
  const org = orgs.find(o => o.id === match[1]);
  if (!org) return route.fulfill({ status: 404, json: { detail: { error: "not_found", message: "Scope unavailable." } } });
  const tail = match[2];
  if (tail === "/context") return route.fulfill({ json: contextFor(org) });
  const sid = url.searchParams.get("site_id") ?? /\/sites\/(\d+)\/snapshot/.exec(tail)?.[1];
  const site = sid ? org.sites.find(s => s.id === sid) : undefined;
  if (sid && !site) return route.fulfill({ status: 404, json: { detail: { error: "not_found", message: "Scope unavailable." } } });
  const scope = { organisation_id: org.id, site_id: sid ?? null };
  if (tail === "/reports/snapshot") {
    if (state.reportFailure === "network") return route.abort();
    if (state.reportFailure === "invalid") return route.fulfill({ json: { scope, snapshot: { ...snapshot(org, site), payload: [] } } });
    if (state.reportFailure) return route.fulfill({ status: state.reportFailure, json: { detail: { error: "source_unavailable", message: "Real report failure" } } });
    if (state.holdReport) {
      state.holdReport = false;
      await new Promise(resolve => state.releaseReport = resolve);
    }
    return route.fulfill({ json: { scope: state.staleScope ? { ...scope, organisation_id: "999" } : scope, snapshot: snapshot(org, site, org.id === "29") } });
  }
  if (tail.endsWith("/snapshot")) return route.fulfill({ json: snapshot(org, site, org.id === "29") });
  if (tail === "/devices") {
    if (state.deviceFailure) return route.fulfill({ status: 503, json: { detail: { message: "Device storage unavailable" } } });
    if (state.holdDevices) await new Promise(resolve => state.releaseDevices = resolve);
    const items = Array.from({ length: state.deviceCount }, (_, i) => ({
      ref: `device:${201+i}`, kind: "device", site_id: org.sites[0]?.id ?? "42", site_name: org.sites[0]?.name ?? "New Site",
      name: `Camera ${i+1}`, canonical_enabled: true, runtime_state: "offline", last_activity: null, records: 0, records_status: "available",
    }));
    return route.fulfill({ json: { scope, items, records_status: "available" } });
  }
  return route.fulfill({ json: {} });
});
const portalPath = (org, site, module) => `/sites/organisations/${org.id}${site ? `/sites/${site.id}` : ""}/${module}`;
try {
  const cases = [[orgs[0]], [orgs[1]], [orgs[1], orgs[1].sites[0]], [orgs[2]], [orgs[2], orgs[2].sites[0]], [orgs[2], orgs[2].sites[1]], [orgs[3]], [orgs[3], orgs[3].sites[0]]];
  for (const [org, site] of cases) {
    await page.goto(base + portalPath(org, site, "reports"));
    await expect(page.getByRole("combobox", { name: "Period" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Period" }).locator("option")).toHaveText(labels);
    await expect(page.getByRole("heading", { name: /No report|Reports are unavailable/ })).toHaveCount(0);
    for (const type of ["Site Activity", "Visitor Profile"]) {
      await page.getByRole("button", { name: new RegExp(type) }).click();
      for (const period of periods) {
        await page.getByRole("combobox", { name: "Period" }).selectOption(period);
        const pending = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download Report", exact: true }).click();
        const download = await pending;
        assert.equal(await download.failure(), null);
        const file = path.join(out, `${org.id}-${site?.id ?? "all"}-${type.replaceAll(" ", "-")}-${period}.pdf`);
        await download.saveAs(file);
        const bytes = await readFile(file);
        assert.equal(bytes.subarray(0,5).toString(), "%PDF-");
        const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
        assert(text.includes(site ? `${org.name} - ${site.name}` : org.name));
        assert(text.includes(`${type} Report`));
        assert(text.includes(labels[periods.indexOf(period)]));
        assert(text.includes("Generated:") && text.includes("Camos Reports") && text.includes("Page 1 of"));
        assert.doesNotMatch(text, /NaN|Infinity|No report data|Reports unavailable/);
        if (type === "Site Activity") {
          for (const section of ["ENTRANCES", "EXITS", "AVG OCCUPANCY", "AVG DWELL", "Footfall", "Occupancy", "Dwell", "Period summary"]) assert(text.includes(section), section);
        } else {
          for (const section of ["Age distribution", "Sex split", "Visitor profile summary"]) assert(text.includes(section));
          if (org.id !== "29") {
            assert(text.includes("Based on 0 entrances"));
            assert.doesNotMatch(text, /Largest age group: 0-4/);
            assert(text.includes("Sex split: 0% Male / 0% Female"));
          } else assert(text.includes("Largest age group: 66+"));
        }
        if (period === "all_time" && org.id !== "29") assert.match(text, /2026\s*[–-]\s*2026/);
        downloads++;
        // Chromium limits bursts of automatic downloads; keep this matrix below that rate.
        await page.waitForTimeout(200);
      }
    }
    checks++;
    console.log(`PASS report matrix: ${org.name}${site ? ` / ${site.name}` : " / All Sites"}`);
  }
  // Real failures stay failures, with the normal retry path.
  for (const failure of [404, 502, 503, "network", "invalid"]) {
    state.reportFailure = failure;
    await page.goto(base + portalPath(orgs[1], undefined, "reports"));
    await expect(page.getByRole("heading", { name: "Reports are unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download Report" })).toHaveCount(0);
    state.reportFailure = null;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("button", { name: "Download Report" })).toBeVisible();
    checks++;
  }
  await page.evaluate(() => {
    window.originalBlob = window.Blob;
    window.Blob = class { constructor() { throw new Error("PDF generation rejected"); } };
  });
  await page.getByRole("button", { name: "Download Report" }).click();
  await expect(page.getByText("PDF generation rejected", { exact: true })).toBeVisible();
  await page.evaluate(() => window.Blob = window.originalBlob);
  checks++;
  state.staleScope = true;
  await page.reload();
  await expect(page.getByText("Response scope mismatch", { exact: true })).toBeVisible();
  state.staleScope = false;
  state.holdReport = true;
  await page.goto(base + portalPath(orgs[1], orgs[1].sites[0], "reports"));
  await expect.poll(() => Boolean(state.releaseReport)).toBe(true);
  await page.goto(base + portalPath(orgs[2], orgs[2].sites[0], "reports"));
  state.releaseReport();
  await expect(page.locator(".portal-reports-scope-pill")).toHaveText("First Site");
  await expect(page.getByRole("button", { name: "Download Report" })).toBeVisible();
  checks++;

  for (const count of [0, 1, 4]) {
    state.deviceCount = count;
    await page.goto(base + portalPath(orgs[1], undefined, "device-list"));
    await expect(page.getByRole("button", { name: "Refresh All" })).toBeEnabled();
    await expect(page.locator(".device-runtime-card")).toHaveCount(count);
    await expect(page.getByText("No sources in this scope.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Source summary" })).toBeVisible();
    if (count === 0) {
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const blank = page.locator('.device-runtime-empty');
        await expect(blank).toHaveText('');
        assert((await blank.boundingBox()).height >= 180);
        const card = await page.locator('.device-runtime-section').boundingBox();
        const button = await page.getByRole('button', {name:'Refresh All'}).boundingBox();
        assert(card.y + card.height - button.y - button.height >= 180, 'empty body must protect the control from bottom clipping');
      }
      await page.setViewportSize({width:1440,height:1000});
    }
    checks++;
  }
  state.deviceCount = 0;
  state.holdDevices = true;
  await page.reload();
  await expect(page.getByRole("status", { name: "Loading devices" })).toBeVisible();
  state.holdDevices = false;
  state.releaseDevices();
  await expect(page.getByRole("button", { name: "Refresh All" })).toBeEnabled();
  state.deviceFailure = true;
  await page.reload();
  await expect(page.getByText("Device data is unavailable.", { exact: true })).toBeVisible();
  state.deviceFailure = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Refresh All" })).toBeEnabled();
  checks++;

  for (const [org, site] of cases.slice(0, 6)) {
    await page.goto(base + portalPath(org, site, "dashboard"));
    await expect(page.locator(".traffic-distribution .recharts-sector")).toHaveCount(1);
    await expect(page.locator(".traffic-distribution .recharts-sector")).toHaveAttribute("fill", "var(--vrm-bg-panel, var(--surface-panel, #e8edf2))");
    await expect(page.locator(".traffic-distribution__center")).toHaveText("—");
    const colours = await page.evaluate(() => ({ traffic: getComputedStyle(document.querySelector('.traffic-distribution .recharts-sector')).fill,
      capacity: [...document.querySelectorAll('.capacity-usage .recharts-sector')].map(el => getComputedStyle(el).fill) }));
    assert(colours.capacity.includes(colours.traffic), 'Traffic zero fill must match Capacity Remaining');
    await expect(page.getByText("Traffic Split data unavailable.")).toHaveCount(0);
    await page.screenshot({ path: path.join(out, `dashboard-${org.id}-${site?.id ?? "all"}.png`), fullPage: true });
    checks++;
  }
  assert(!requests.some(r => r.search.includes("effective_now") || r.path.includes("/api/demo/")));
  assert(!requests.some(r => !["GET", "HEAD", "OPTIONS"].includes(r.method)), "report generation is local, without writes");
  assert.deepEqual(errors, []);

  // Keep the same React/chart instances mounted while switching zero and positive models.
  const componentDir = path.resolve(".tmp/authenticated-zero-data");
  await mkdir(componentDir, { recursive: true });
  const chartSnapshots = [snapshot(orgs[0], undefined), snapshot(orgs[1], undefined), snapshot(orgs[1], undefined, true)];
  await writeFile(path.join(componentDir, "chart.tsx"), `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ChartRenderer } from '../../src/analytics/components/ChartRenderer/ChartRenderer';
    import { projectKpis } from '../../src/features/organisation-dashboard/projection';
    const snapshots = ${JSON.stringify(chartSnapshots)};
    function App() {
      const [index, setIndex] = useState(0);
      const [mode, setMode] = useState('legacy');
      const charts = projectKpis(snapshots[index]);
      return <><button onClick={() => setIndex(0)}>Empty</button><button onClick={() => setIndex(1)}>Known zero</button><button onClick={() => setIndex(2)}>Positive</button>
        <button onClick={() => setMode(mode === 'legacy' ? 'demo_cursor_hover' : 'legacy')}>Toggle tooltip</button>
        <div style={{width:400}}><ChartRenderer result={charts[5].result} height={200} donutTooltipMode={mode}/></div>
        <div style={{width:400}}><ChartRenderer result={charts[6].result} height={200}/></div></>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `);
  await page.route("**/__zero-chart-test", route => route.fulfill({ contentType: "text/html", body: `<html><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script><script type="module" src="/.tmp/authenticated-zero-data/chart.tsx"></script></body></html>` }));
  await page.goto(base + "/__zero-chart-test");
  for (const mode of ["legacy", "demo_cursor_hover"]) {
    if (mode !== "legacy") await page.getByRole("button", { name: "Toggle tooltip" }).click();
    for (const label of ["Empty", "Positive", "Known zero", "Positive", "Empty"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      const ring = page.locator(".traffic-distribution .recharts-sector");
      await expect(ring).toHaveCount(1);
      if (label === "Positive") await expect(page.locator(".traffic-distribution__center")).toHaveAttribute("aria-label", "New Site");
      else await expect(page.locator(".traffic-distribution__center")).toHaveText("—");
      if (label !== "Positive") {
        await expect(ring).toHaveAttribute("fill", "var(--vrm-bg-panel, var(--surface-panel, #e8edf2))");
        await ring.hover({ position: { x: 68, y: 10 } });
        await expect(page.locator(".traffic-distribution")).not.toContainText("100%");
        await expect(page.locator(".traffic-distribution .analytics-chart-tooltip--donut")).toHaveCount(0);
        await expect(page.locator(".capacity-usage__center")).toHaveText("0%");
      }
    }
  }
  assert.deepEqual(errors, [], "empty/populated transitions must not break hooks");
  checks++;
  console.log(`Authenticated zero-data browser checks passed: ${checks} scenarios, ${downloads} PDF downloads verified with pdftotext.`);
} catch (error) {
  console.error("Zero-data browser failure", { checks, downloads, url: page.url() });
  console.error(await page.locator("body").innerText());
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
