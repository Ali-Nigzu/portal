import {
  buildSiteActivityMetrics,
  buildTimeframeRange,
  buildVisitorProfileMetrics,
  resolveRollup,
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
    const range = buildTimeframeRange(snapshotTs, "all_time");
    expect(range.startLabel).toBe("Start: dataset");
    expect(range.endLabel).toBe("2026-01-19");
  });

  it("picks rollup index based on timeframe", () => {
    const payload = [[], [], [], [], [], [], [], [[1], [2], [3], [4], [5], [6], [7]]];
    const rollup = resolveRollup(payload, "last_quarter");
    expect(rollup).toEqual([5]);
  });
});
