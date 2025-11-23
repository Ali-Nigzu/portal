import type { ChartResult } from "../../../analytics/schemas/charting";
import { applyTrafficDistributionShare, lookupCapacity, resolveUiClient } from "./vrmDecorators";

describe("vrm capacity mapping", () => {
  it("maps table client0 to ui client1 with capacity 10", () => {
    expect(resolveUiClient("client0")).toBe("client1");
    expect(lookupCapacity("client0")).toBe(10);
  });

  it("maps table client1 to ui client2 with capacity 100", () => {
    expect(resolveUiClient("client1")).toBe("client2");
    expect(lookupCapacity("client1")).toBe(100);
  });

  it("throws for unknown clients", () => {
    expect(() => lookupCapacity("unknown-client")).toThrow("Unknown client for capacity usage");
  });
});

describe("traffic distribution decorator", () => {
  it("computes last-bucket shares and VRM metadata", () => {
    const result: ChartResult = {
      chartType: "composed_time",
      xDimension: { id: "timestamp", type: "time" },
      series: [
        {
          id: "cam-1",
          label: "Events | camera_id=1",
          geometry: "column",
          unit: "events",
          data: [
            { x: "2024-01-01T00:00:00Z", value: 10 },
            { x: "2024-01-01T00:15:00Z", value: 30 },
          ],
        },
        {
          id: "cam-2",
          label: "Events | camera_id=2",
          geometry: "column",
          unit: "events",
          data: [
            { x: "2024-01-01T00:00:00Z", value: 20 },
            { x: "2024-01-01T00:15:00Z", value: 10 },
          ],
        },
      ],
      meta: { timezone: "UTC" },
    };

    const decorated = applyTrafficDistributionShare(result);
    const primarySeries = decorated.series[0];

    expect(decorated.chartType).toBe("categorical");
    expect(decorated.meta?.summary?.chartSubType).toBe("traffic_distribution");
    expect(decorated.meta?.summary?.chartStyle).toBe("traffic_distribution");
    expect(decorated.meta?.summary?.presentation).toBe("vrm");

    expect(primarySeries.data.map((point) => point.x)).toEqual(["1", "2"]);
    expect(primarySeries.data.map((point) => point.value ?? point.y)).toEqual([75, 25]);
    expect(decorated.meta?.summary?.headlineValue).toBe(75);
  });

  it("drops cameras without finite last-bucket data and uses remaining shares", () => {
    const result: ChartResult = {
      chartType: "composed_time",
      xDimension: { id: "timestamp", type: "time" },
      series: [
        {
          id: "cam-1",
          label: "Events | camera_id=1",
          geometry: "column",
          unit: "events",
          data: [],
        },
        {
          id: "cam-2",
          label: "Events | camera_id=2",
          geometry: "column",
          unit: "events",
          data: [
            { x: "2024-01-01T00:00:00Z", value: null },
            { x: "2024-01-01T00:15:00Z", value: 40 },
          ],
        },
      ],
      meta: { timezone: "UTC" },
    };

    const decorated = applyTrafficDistributionShare(result);
    const primarySeries = decorated.series[0];

    expect(primarySeries.data.map((point) => point.x)).toEqual(["2"]);
    expect(primarySeries.data.map((point) => point.value ?? point.y)).toEqual([100]);
    expect(decorated.meta?.summary?.headlineValue).toBe(100);
    expect(decorated.meta?.summary?.chartSubType).toBe("traffic_distribution");
  });
});
