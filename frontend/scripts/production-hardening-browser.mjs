import assert from "node:assert/strict";
import path from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import ts from "typescript";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { fixture } from "./organisation-dashboard-tests.mjs";

// Run against a production preview. Baseline mode measures the exact-base build
// with the same harness and records its known redundant loads/recomputations.
const baseline = process.env.PORTAL_HARDENING_BASELINE === "1";
const base = process.env.PORTAL_BROWSER_BASE_URL ?? "http://127.0.0.1:3100";
const output = path.resolve("test-results/production-hardening");
await mkdir(output, { recursive: true });
const buildRoot = path.resolve("build");
const html = await readFile(path.join(buildRoot, "index.html"), "utf8");
const roots = [...html.matchAll(/(?:src|href)="(\/static\/[^" ]+\.js)"/g)].map(m => m[1]);
const graph = new Map();
async function visit(url) {
  if (graph.has(url)) return;
  const content = await readFile(path.join(buildRoot, url), "utf8");
  graph.set(url, { raw: Buffer.byteLength(content), gzip: gzipSync(content, { level: 9 }).length });
  const source = ts.createSourceFile(url, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
    const specifier = node.moduleSpecifier;
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith("."))
      await visit(path.posix.join(path.posix.dirname(url), specifier.text));
  }
}
for (const root of roots) await visit(root);
const pdfPattern = /vendor-(jspdf|html2canvas|canvg|fflate|pako)/;
const closure = { chunks: graph.size, raw: [...graph.values()].reduce((n, x) => n + x.raw, 0), gzip: [...graph.values()].reduce((n, x) => n + x.gzip, 0), files: [...graph.keys()].sort() };
if (!baseline) assert(!closure.files.some(file => pdfPattern.test(file)), "PDF libraries must not own bootstrap helpers");
const browser = await chromium.launch({ headless: true, ...(process.env.PORTAL_BROWSER_EXECUTABLE ? { executablePath: process.env.PORTAL_BROWSER_EXECUTABLE } : {}) });
const coldLoads = {};
try {
  for (const route of ["/home", "/login", "/admin/login"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], scripts = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname); });
    await page.route("https://consent.cookiebot.com/**", r => r.abort());
    await page.route("**/api/**", r => r.fulfill({ status: 401, json: { detail: "Not authenticated" } }));
    await page.goto(base + route, { waitUntil: "networkidle" });
    if (route === "/home") await expect(page.locator("main")).toBeVisible();
    else if (route === "/login") await expect(page.getByLabel("Email or username")).toBeVisible();
    else await expect(page.locator('input[type="password"]')).toBeVisible();
    assert.deepEqual(errors, []);
    coldLoads[route] = scripts;
    if (!baseline) assert(!scripts.some(file => pdfPattern.test(file)), `${route} loaded the PDF subtree`);
    await context.close();
  }

  // The production Portal feature keeps its existing eager Reports/PDF
  // dependency. Navigate into it and verify both real PDF downloads still work.
  const portalPage = await browser.newPage({ acceptDownloads: true });
  const portalErrors = [];
  portalPage.on("pageerror", error => portalErrors.push(error.message));
  const anchor = "2026-09-14T13:30:00Z";
  await portalPage.route("https://consent.cookiebot.com/**", r => r.abort());
  await portalPage.route("**/api/**", r => {
    const url = new URL(r.request().url()), route = url.pathname;
    if (route === "/api/me") return r.fulfill({ json: { user: { id: "1", name: "Tester", email: "tester@example.com" } } });
    if (route === "/api/portal/organisations") return r.fulfill({ json: { organisations: [{ id: "1", name: "Org", role: 0, sites: [] }] } });
    if (route.endsWith("/context")) return r.fulfill({ json: { organisation: { id: "1", name: "Org", slug: "org", enabled: true, realtime: false }, sites: [], sources: [], clock: { server_now: anchor, effective_now: anchor, time_zone: "Europe/London" } } });
    if (route.endsWith("/reports/snapshot")) return r.fulfill({ json: { scope: { organisation_id: "1", site_id: null }, snapshot: fixture() } });
    if (route.endsWith("/snapshot")) return r.fulfill({ json: fixture() });
    return r.fulfill({ json: { documents: [] } });
  });
  await portalPage.goto(base + "/home", { waitUntil: "networkidle" });
  await expect(portalPage.getByRole("heading", { name: "Welcome Tester" })).toBeVisible();
  await portalPage.goto(base + "/sites/organisations/1/dashboard", { waitUntil: "networkidle" });
  await portalPage.locator(".authenticated-navigation__rail").hover({ position: { x: 10, y: 250 } });
  await portalPage.locator(".authenticated-navigation__secondary").getByRole("button", { name: "Reports", exact: true }).click();
  await expect(portalPage.getByRole("combobox", { name: "Period" })).toBeVisible();
  let downloads = 0;
  for (const type of ["Site Activity", "Visitor Profile"]) {
    await portalPage.getByRole("button", { name: new RegExp(type) }).click();
    const pending = portalPage.waitForEvent("download");
    await portalPage.getByRole("button", { name: "Download Report", exact: true }).click();
    const download = await pending;
    const file = await download.path();
    assert.equal((await readFile(file)).subarray(0, 5).toString(), "%PDF-");
    downloads++;
  }
  assert.deepEqual(portalErrors, []);
  await portalPage.close();

  // Instrument only the test bundle's public Reports builder; production source
  // and assets stay untouched. Exercise the real PortalReports/ReportsPage pair.
  const snapshot = fixture();
  const view = { key: "1:organisation:1", selection: { scope: "organisation", id: "1" }, context: { organisation: { id: "1", name: "Org" }, sites: [], clock: { effective_now: "2026-09-14T13:30:00Z" } } };
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import PortalReports from './src/features/reports/PortalReports';
      window.__reportBuilds=0; window.__portalView=${JSON.stringify(view)};
      window.__portalView.source={request:async()=>new Response(JSON.stringify({snapshot:${JSON.stringify(snapshot)}}))};
      function Harness(){const [revision,bump]=React.useState(0);window.__rerender=()=>bump(v=>v+1);return <div data-revision={revision}><PortalReports/></div>};
      createRoot(document.getElementById('root')).render(<Harness/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", loader: { ".css": "empty" }, define: { "import.meta.env": "{}" },
    plugins: [{ name: "test-only-counters", setup(plugin) {
      plugin.onLoad({ filter: /PortalContext\.tsx$/ }, () => ({ contents: "export const usePortal=()=>window.__portalView; export const scopeParams=()=>new URLSearchParams(); export const verifyScope=()=>{};", loader: "ts" }));
      plugin.onLoad({ filter: /ReportsEngine\.ts$/ }, async ({ path: file }) => {
        const source = await readFile(file, "utf8");
        assert.equal(source.split("): ReportData {").length, 2);
        return { contents: source.replace("): ReportData {", "): ReportData { window.__reportBuilds++;"), loader: "ts" };
      });
    }}],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.getByRole("combobox", { name: "Period" })).toBeVisible();
  assert.equal(await page.evaluate(() => window.__reportBuilds), 1);
  await page.evaluate(() => window.__rerender());
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "1");
  const repeatedBuilds = await page.evaluate(() => window.__reportBuilds);
  assert.equal(repeatedBuilds, baseline ? 2 : 1);
  await page.evaluate(() => { window.__portalView.context.clock.effective_now = "2026-09-15T00:00:00Z"; window.__rerender(); });
  await expect(page.locator("[data-revision]")).toHaveAttribute("data-revision", "2");
  assert.equal(await page.evaluate(() => window.__reportBuilds), repeatedBuilds + 1, "new clock must recompute");
  await page.getByRole("combobox", { name: "Period" }).selectOption("last_week");
  assert.equal(await page.evaluate(() => window.__reportBuilds), repeatedBuilds + 2, "selected period must recompute");
  assert.deepEqual(errors, []);
  const result = { baseline, closure, coldLoads, portal: { navigation: "Home → Dashboard → Reports", pdfDownloads: downloads }, reports: { initialBuilds: 1, afterUnrelatedRender: repeatedBuilds, clockChangeBuilds: 1, periodChangeBuilds: 1 } };
  await writeFile(path.join(output, "measurements.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.log("Production hardening graph, cold routes and Reports render checks passed");
} finally { await browser.close(); }
