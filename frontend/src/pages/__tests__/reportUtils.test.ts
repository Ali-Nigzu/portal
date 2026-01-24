import {
  buildSiteActivityMetrics,
  formatReportDateRange,
  buildVisitorProfileMetrics,
  resolveRollup,
  getReportHeaderRange,
} from "../reports/reportUtils";

describe("reportUtils", () => {
  it("computes site activity metrics from rollup arrays", () => {
    const rollup = [
      [1, 2, 3],
      [1, 1, 0],
      [5, 10, 15],
      [],
      [3, 6, 9],
    ];

    const metrics = buildSiteActivityMetrics(rollup);

    expect(metrics.totalEntrances).toBe(6);
    expect(metrics.totalExits).toBe(2);
    expect(metrics.netFlow).toBe(4);
    expect(metrics.occupancyMin).toBe(5);
    expect(metrics.occupancyMax).toBe(15);
    expect(metrics.occupancyAvg).toBe(10);
    expect(metrics.dwellAvg).toBe(6);
    expect(metrics.dwellMax).toBe(9);
  });

  it("handles empty rollups safely", () => {
    const metrics = buildSiteActivityMetrics([]);
    expect(metrics.totalEntrances).toBe(0);
    expect(metrics.occupancyAvg).toBe(0);
    expect(metrics.dwellMax).toBe(0);
  });

  it("maps visitor profile metrics from demographics arrays", () => {
    const rollup = [
      [5, 5],
      [],
      [],
      [],
      [],
      [10, 20, 5, 3, 2, 1],
      [60, 40],
      [50, 30, 20],
    ];

    const metrics = buildVisitorProfileMetrics(rollup);
    expect(metrics.totalEntrances).toBe(10);
    expect(metrics.dominantAgeBucket).toBe("5-13");
    expect(metrics.sexSplit).toEqual({ Male: 60, Female: 40 });
    expect(metrics.raceSplit).toEqual({ Light: 50, Mix: 30, Dark: 20 });
  });

  it("resolves timeframe range labels", () => {
    const snapshotTs = new Date("2026-01-19T00:00:00Z");
    const now = new Date("2026-02-02T12:00:00Z");
    const range = formatReportDateRange(snapshotTs, "all_time", now);
    expect(range.subtitle).toBe("All Time • Jan 2026 – Jan 2026");
    expect(range.end.toISOString()).toBe(snapshotTs.toISOString());
  });

  it("clamps header end to now and snapshot timestamps", () => {
    const snapshotTs = new Date("2026-01-10T00:00:00Z");
    const now = new Date("2026-01-08T12:00:00Z");
    const header = getReportHeaderRange("last_month", snapshotTs, now);
    expect(header.end.toISOString()).toBe(now.toISOString());
    expect(header.start.getTime()).toBeLessThanOrEqual(header.end.getTime());
  });

  it("uses clamped end anchors for last month and last year headers", () => {
    const snapshotTs = new Date("2026-01-24T08:00:00Z");
    const now = new Date("2026-02-10T09:00:00Z");
    const lastMonthHeader = getReportHeaderRange("last_month", snapshotTs, now);
    const lastYearHeader = getReportHeaderRange("last_year", snapshotTs, now);

    expect(lastMonthHeader.end.toISOString()).toBe(snapshotTs.toISOString());
    expect(lastYearHeader.end.toISOString()).toBe(snapshotTs.toISOString());
    expect(lastMonthHeader.labelLine).toBe("1–24 Jan 2026");
    expect(lastYearHeader.labelLine.startsWith("Jan 2026")).toBe(true);
  });

  it("picks rollup index based on timeframe", () => {
    const payload = [[], [], [], [], [], [], [], [[1], [2], [3], [4], [5], [6], [7]]];
    const rollup = resolveRollup(payload, "last_quarter");
    expect(rollup).toEqual([5]);
  });
});
