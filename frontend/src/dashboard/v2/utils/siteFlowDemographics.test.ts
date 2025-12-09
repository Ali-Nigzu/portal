import { mapChartResultsToDemographics, resolveDemographicsTimeWindow } from "./siteFlowDemographics";
import type { ChartResult } from "../../../analytics/schemas/charting";

describe("mapChartResultsToDemographics", () => {
  const baseResult = (data: { x: string | number; value?: number; y?: number }[]): ChartResult => ({
    chartType: "categorical",
    xDimension: { id: "category", type: "category", bucket: undefined, timezone: "UTC" },
    series: [
      {
        id: "events",
        label: "Events",
        geometry: "bar",
        data: data.map((point) => ({ ...point, x: String(point.x) })),
      },
    ],
    meta: {
      timezone: "UTC",
      coverage: [],
      surges: [],
      summary: { points: data.length, measure: "events" },
    },
  });

  it("maps age, gender, and race buckets while preserving timezone", () => {
    const result = mapChartResultsToDemographics({
      age: baseResult([
        { x: 0, value: 2 },
        { x: 1, value: 1 },
      ]),
      gender: baseResult([
        { x: 0, value: 3 },
        { x: 1, value: 1 },
      ]),
      race: baseResult([
        { x: 2, value: 4 },
        { x: 5, value: 1 },
      ]),
      timezone: "America/New_York",
    });

    expect(result.timezone).toBe("America/New_York");
    expect(result.age.map((slice) => slice.label)).toEqual(["0–4", "5–13"]);
    expect(result.gender.map((slice) => slice.label)).toEqual(["Male", "Female"]);
    expect(result.race.map((slice) => slice.label)).toEqual(["Dark", "Unknown"]);
  });
});

describe("resolveDemographicsTimeWindow", () => {
  it("uses an all-time window by default when no range is provided", () => {
    const anchor = new Date("2024-02-01T12:00:00Z");

    const window = resolveDemographicsTimeWindow(null, undefined, anchor);

    expect(window.to).toBe(anchor.toISOString());
    expect(window.from).toBe(new Date(0).toISOString());
  });
});
