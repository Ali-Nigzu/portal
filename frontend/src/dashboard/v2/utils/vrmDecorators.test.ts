import type { ChartResult } from "../../../analytics/schemas/charting";
import { VRM_KPI_IDS } from "./applyVRMOverrides";
import {
  applyTrafficDistributionShare,
  decorateResult,
  lookupCapacity,
  resolveUiClient,
} from "./vrmDecorators";

describe("vrm capacity mapping", () => {
  it("maps table client0 to ui client1 with capacity 5", () => {
    expect(resolveUiClient("client0")).toBe("client1");
    expect(lookupCapacity("client0")).toBe(5);
  });

  it("maps table client1 to ui client2 with capacity 750", () => {
    expect(resolveUiClient("client1")).toBe("client2");
    expect(lookupCapacity("client1")).toBe(750);
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
    expect((decorated as unknown as { chartStyle?: string }).chartStyle).toBe("traffic_distribution");
    expect((decorated as unknown as { chartSubType?: string }).chartSubType).toBe("traffic_distribution");
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

  it("renders zero-value slices instead of empty state when totals are zero", () => {
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
            { x: "2024-01-01T00:00:00Z", value: 0 },
            { x: "2024-01-01T00:15:00Z", value: 0 },
          ],
        },
      ],
      meta: { timezone: "UTC" },
    };

    const decorated = applyTrafficDistributionShare(result, "client0");
    const primarySeries = decorated.series[0];

    expect(decorated.meta?.summary?.headlineValue).toBe(0);
    expect(primarySeries.data).toHaveLength(1);
    expect(primarySeries.data[0]).toEqual({ x: "Cam 0", value: 0, y: 0 });
    expect(decorated.meta?.summary?.chartSubType).toBe("traffic_distribution");
  });
});

describe("vrm dwell headline carry-forward", () => {
  it("uses the latest non-null dwell value when the last bucket is null", () => {
    const dwellResult: ChartResult = {
      chartType: "single_value",
      xDimension: { id: "timestamp", type: "time" },
      series: [
        {
          id: "dwell",
          label: "dwell",
          geometry: "line",
          unit: "minutes",
          data: [
            { x: "2024-01-01T00:00:00Z", value: 4 },
            { x: "2024-01-01T00:15:00Z", value: null },
          ],
        },
      ],
      meta: { timezone: "UTC", summary: {} },
    };

    const decorated = decorateResult(VRM_KPI_IDS.dwell, dwellResult, "client1");
    expect(decorated.meta?.summary?.headlineValue).toBe(4);
  });

  it("leaves the headline null when all buckets are null", () => {
    const dwellResult: ChartResult = {
      chartType: "single_value",
      xDimension: { id: "timestamp", type: "time" },
      series: [
        {
          id: "dwell",
          label: "dwell",
          geometry: "line",
          unit: "minutes",
          data: [
            { x: "2024-01-01T00:00:00Z", value: null },
            { x: "2024-01-01T00:15:00Z", value: null },
          ],
        },
      ],
      meta: { timezone: "UTC", summary: {} },
    };

    const decorated = decorateResult(VRM_KPI_IDS.dwell, dwellResult, "client1");
    expect(decorated.meta?.summary?.headlineValue).toBeNull();
  });
});
