import {
  mapChartResultsToDemographics,
  resolveDemographicsTimeWindow,
} from "./siteFlowDemographics";
import type { ChartResult } from "../../../analytics/schemas/charting";

describe("mapHours", () => {
  const baseResult = (data: { x: string | number; value?: number; y?: number }[]): ChartResult => ({
    chartType: "categorical",
    xDimension: { id: "timestamp", type: "category", bucket: undefined, timezone: "UTC" },
    series: [
      {
        id: "events",
        label: "Events",
        geometry: "bar",
        data: data.map((point) => ({ ...point, x: String(point.x) })),
      },
    ],
    meta: { timezone: "UTC", coverage: [], surges: [], summary: { points: data.length, measure: "events" } },
  });

  it("returns multiple slices when multiple hour buckets are present", () => {
    const result = mapChartResultsToDemographics({
      hour: baseResult([
        { x: "0", value: 5 },
        { x: "1", value: 3 },
        { x: "2", value: 7 },
      ]),
    });

    expect(result.hour).toHaveLength(3);
    expect(result.hour.map((slice) => slice.hour)).toEqual([0, 1, 2]);
    expect(result.hour.map((slice) => slice.label)).toEqual(["00:00", "01:00", "02:00"]);
  });

  it("parses iso and hh:mm hour strings", () => {
    const result = mapChartResultsToDemographics({
      hour: baseResult([
        { x: "2024-01-01T15:10:00Z", y: 4 },
        { x: "08:30", y: 2 },
      ]),
    });

    expect(result.hour).toHaveLength(2);
    expect(result.hour.map((slice) => slice.hour)).toEqual([8, 15]);
  });

  it("drops invalid hour buckets without collapsing valid ones", () => {
    const result = mapChartResultsToDemographics({
      hour: baseResult([
        { x: "bad", value: 10 },
        { x: "3", value: 5 },
        { x: 4, value: 1 },
      ]),
    });

    expect(result.hour).toHaveLength(2);
    expect(result.hour.map((slice) => slice.hour)).toEqual([3, 4]);
  });
});

describe("resolveDemographicsTimeWindow", () => {
  it("uses a bounded default instead of epoch when no range is provided", () => {
    const anchor = new Date("2024-02-01T12:00:00Z");

    const window = resolveDemographicsTimeWindow(null, undefined, anchor);

    expect(window.to).toBe(anchor.toISOString());
    expect(new Date(window.from).getTime()).toBe(
      anchor.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
  });
});
