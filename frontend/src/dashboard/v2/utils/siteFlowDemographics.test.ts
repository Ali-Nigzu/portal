import { mapChartResultsToDemographics } from "./siteFlowDemographics";
import type { ChartResult } from "../../../analytics/schemas/charting";

describe("mapHours", () => {
  const baseResult = (data: { x: string | number; value?: number; y?: number }[]): ChartResult => ({
    chartType: "categorical",
    xDimension: { id: "timestamp", type: "category", bucket: null, timezone: "UTC" },
    series: [
      {
        id: "events",
        label: "Events",
        geometry: "bar",
        data,
      },
    ],
    meta: { timezone: "UTC", coverage: [], surges: [], summary: { points: data.length, measures: ["events"] } },
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
