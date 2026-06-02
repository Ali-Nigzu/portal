import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outdir = path.resolve(".tmp/reports-engine-tests");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const outfile = path.join(outdir, "ReportsEngine.mjs");

await build({
  entryPoints: ["src/features/reports/engine/ReportsEngine.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  define: {
    "import.meta.env.VITE_API_URL": '"http://api.test"',
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_ENVIRONMENT": '"test"',
  },
});

const engine = await import(pathToFileURL(outfile).href);

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
const snapshot = (siteView, base, dwellValue) => ({
  ts: "2026-02-20T12:00:00Z",
  mode: "snapshots",
  orgId: "client1",
  siteView,
  fallback: false,
  payload: payload(base, dwellValue),
});

const credentials = {
  username: "client1",
  password: "secret",
  orgId: "client1",
};

const mockFetchFor =
  (snapshots, urls = []) =>
  async (url) => {
    urls.push(String(url));
    const parsed = new URL(String(url));
    const siteView = parsed.searchParams.get("siteView");
    const body = snapshots[siteView];
    return new Response(JSON.stringify(body), {
      status: body ? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  };

{
  const urls = [];
  const siteA = await engine.loadReportData({
    reportType: "site-activity",
    timeframe: "today",
    pathname: "/demo/site-a/reports",
    fetchFn: mockFetchFor(
      {
        "site-a": snapshot("site-a", 1, 5),
        "site-b": snapshot("site-b", 10, 9),
      },
      urls,
    ),
    credentials,
  });
  const siteB = await engine.loadReportData({
    reportType: "site-activity",
    timeframe: "today",
    pathname: "/demo/site-b/reports",
    fetchFn: mockFetchFor(
      {
        "site-a": snapshot("site-a", 1, 5),
        "site-b": snapshot("site-b", 10, 9),
      },
      urls,
    ),
    credentials,
  });
  assert.notEqual(
    siteA.metrics.totalEntrances,
    siteB.metrics.totalEntrances,
    "site reports must not share data",
  );
  assert(
    urls.some((url) => url.includes("siteView=site-a")),
    "site-a request must include siteView",
  );
  assert(
    urls.some((url) => url.includes("siteView=site-b")),
    "site-b request must include siteView",
  );
}

{
  const dashboardSnapshot = snapshot("site-b", 4, 8);
  const reportsSnapshot = await engine.loadReportSnapshot({
    siteView: "site-b",
    fetchFn: mockFetchFor({ "site-b": dashboardSnapshot }),
    credentials,
  });
  assert.equal(
    reportsSnapshot.siteView,
    dashboardSnapshot.siteView,
    "Dashboard and Reports siteView must match",
  );
  assert.equal(
    reportsSnapshot.ts,
    dashboardSnapshot.ts,
    "Dashboard and Reports snapshot ts must match",
  );
  assert.equal(
    engine.snapshotPayloadHash(reportsSnapshot),
    engine.snapshotPayloadHash(dashboardSnapshot),
    "Dashboard and Reports payload hashes must match",
  );
}

assert.throws(
  () => engine.resolveReportSiteView("/demo/reports"),
  /Missing site context/,
  "missing site context must hard fail",
);

assert.throws(
  () =>
    engine.validateSnapshotResponse(
      { ...snapshot("site-a", 1, 5), siteView: "site-a" },
      "site-b",
    ),
  /Snapshot site mismatch/,
  "mismatched siteView response must be rejected",
);

assert.throws(
  () =>
    engine.validateSnapshotResponse(
      { ...snapshot("site-b", 1, 5), fallback: true },
      "site-b",
    ),
  /fallback responses are not allowed/,
  "fallback responses must be rejected",
);

engine.validateSchemaPayload(payload(2, 6));
assert.throws(
  () => engine.validateSchemaPayload([[], [], []]),
  /14 slots/,
  "schema payload length must be enforced",
);
const invalidOccupancyPayload = payload(2, 6);
invalidOccupancyPayload[7][1] = [1, 2, 3];
assert.throws(
  () => engine.validateSchemaPayload(invalidOccupancyPayload),
  /occupancy\[0\] must be \[avg,min,max\]/,
  "occupancy triplets must be enforced",
);

{
  const data = engine.buildSiteActivityReportData({
    snapshot: snapshot("site-b", 3, 11),
    siteView: "site-b",
    timeframe: "today",
    now: new Date("2026-02-20T12:30:00Z"),
  });
  assert.equal(
    data.metrics.dwellAvg,
    11,
    "dwell must come from dwell_time_96 aggregation",
  );
  assert.notEqual(
    data.metrics.dwellAvg,
    data.metrics.occupancyAvg,
    "dwell must not come from occupancy rollup values",
  );
}

{
  const data = engine.buildVisitorProfileReportData({
    snapshot: snapshot("site-b", 3, 11),
    siteView: "site-b",
    timeframe: "today",
    now: new Date("2026-02-20T12:30:00Z"),
  });
  assert.deepEqual(data.metrics.agePct, [10, 20, 30, 25, 10, 5]);
  assert.deepEqual(data.metrics.sexPct, [55, 45]);
  assert.deepEqual(data.metrics.racePct, [40, 35, 25]);
}

console.log("ReportsEngine tests passed");
