import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
const outdir = path.resolve(".tmp/reports-engine-tests");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ["src/features/reports/engine/ReportsEngine.ts"],
  outfile: path.join(outdir, "engine.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
});
await build({
  entryPoints: ["src/features/reports/pdf/renderReportPdf.ts"],
  outfile: path.join(outdir, "pdf.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
});
const engine = await import(pathToFileURL(path.join(outdir, "engine.mjs")));
const pdf = await import(pathToFileURL(path.join(outdir, "pdf.mjs")));
const n = (l, v) => Array.from({ length: l }, () => v),
  seq = (l, start = 1) => Array.from({ length: l }, (_, i) => start + i),
  occupancy = (l, avg) =>
    Array.from({ length: l }, () => [avg, Math.max(0, avg - 2), avg + 2]);
const rollup = (length, base) => ({
  entrances: seq(length, base),
  occupancy: occupancy(length, base + 10),
  exits: seq(length, base + 2),
  age_pct: [10, 20, 30, 25, 10, 5],
  sex_pct: [55, 45],
});
const payload = (base = 2, dwell = 7) => {
  const entrances = n(96, base),
    exits = n(96, base + 1);
  return {
    entrances_96: entrances,
    occupancy_96: occupancy(96, base + 10),
    exits_96: exits,
    footfall_96: entrances.map((v, i) => v + exits[i]),
    dwell_time_96: n(96, dwell),
    traffic_devices: [],
    traffic_split_96: n(96, []),
    capacity: n(96, [50, 70]),
    today: rollup(13, base),
    yesterday: rollup(24, base + 1),
    week: rollup(7, base + 2),
    month: rollup(4, base + 3),
    quarter: rollup(12, base + 4),
    year: rollup(12, base + 5),
    all_time: rollup(30, base + 6),
  };
};
const snapshot = (scope = "site", name = "Tokis Takeout") => ({
  scope,
  entity_id: scope === "site" ? "2" : "1",
  entity_name: name,
  ts: "2026-02-20T12:00:00Z",
  payload: payload(),
});
for (const [timeframe, length] of Object.entries({
  today: 13,
  yesterday: 24,
  last_week: 7,
  last_month: 4,
  last_quarter: 12,
  last_year: 12,
  all_time: 30,
})) {
  const data = engine.buildSiteActivityReportData(
    snapshot(),
    timeframe,
    new Date("2026-02-20T12:30:00Z"),
  );
  assert.equal(data.bucketLabels.length, length);
  assert.equal(data.metrics.entrancesSeries.length, length);
  assert.equal(data.metrics.exitsSeries.length, length);
  assert.equal(
    data.metrics.footfallSeries[0],
    data.metrics.entrancesSeries[0] + data.metrics.exitsSeries[0],
  );
  assert.equal(data.metrics.dwellAvg, 7);
}
const activity = engine.buildSiteActivityReportData(
  snapshot(),
  "today",
  new Date("2026-02-20T12:30:00Z"),
);
assert(activity.metrics.totalEntrances > 0);
assert(activity.metrics.occupancyMax >= activity.metrics.occupancyAvg);
assert(activity.metrics.peakEntrancesBucket >= 0);
const visitors = engine.buildVisitorProfileReportData(
  snapshot(),
  "today",
  new Date("2026-02-20T12:30:00Z"),
);
assert.deepEqual(visitors.metrics.agePct, [10, 20, 30, 25, 10, 5]);
assert.deepEqual(visitors.metrics.sexPct, [55, 45]);
assert.equal("racePct" in visitors.metrics, false);
assert.equal(JSON.stringify(visitors).match(/race/i), null);
assert.throws(
  () => engine.validateCanonicalSnapshot({ ...snapshot(), payload: [[], []] }),
  /invalid/i,
  "legacy positional payload is rejected",
);
const generated = new Date("2026-09-25T19:42:00Z");
const siteIdentity = {
  organisationName: "Demo",
  siteName: "Tokis Takeout",
  heading: "Demo - Tokis Takeout",
};
const labels = pdf
  .reportDocumentText(activity, siteIdentity, generated)
  .join(" ");
assert.match(labels, /Demo - Tokis Takeout/);
assert.match(labels, /Site Activity Report/);
assert.match(labels, /Generated:/);
assert.match(labels, /Camos Reports/);
assert.doesNotMatch(labels, /As of|Race|Confidential|Business Intelligence/i);
const orgVisitors = engine.buildVisitorProfileReportData(
  snapshot("organisation", "Demo"),
  "today",
  new Date(),
);
const orgLabels = pdf
  .reportDocumentText(
    orgVisitors,
    { organisationName: "Demo", heading: "Demo" },
    generated,
  )
  .join(" ");
assert.match(orgLabels, /Demo Visitor Profile Report/);
assert.equal(
  pdf.reportFilename(siteIdentity, "Site Activity"),
  "Demo-Tokis-Takeout-Site-Activity-Report.pdf",
);
assert.equal(
  pdf.reportFilename(
    {
      organisationName: "Long / Organisation: Name",
      heading: "Long / Organisation: Name",
    },
    "Visitor Profile",
  ),
  "Long-Organisation-Name-Visitor-Profile-Report.pdf",
);
const rendered = pdf.renderReportPdf(
  activity,
  {
    organisationName:
      "An extraordinarily long organisation name for report layout",
    siteName: "A similarly long site name",
    heading:
      "An extraordinarily long organisation name for report layout - A similarly long site name",
  },
  generated,
);
assert(
  rendered.doc.getNumberOfPages() >= 2,
  "activity table exercises multi-page output",
);
assert.equal(rendered.filename.endsWith(".pdf"), true);
const visitorPdf = pdf.renderReportPdf(
  orgVisitors,
  { organisationName: "Demo", heading: "Demo" },
  generated,
);
assert.equal(visitorPdf.doc.getNumberOfPages(), 1);
console.log("ReportsEngine and PDF tests passed");
