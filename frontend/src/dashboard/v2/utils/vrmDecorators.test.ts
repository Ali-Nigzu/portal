import type { ChartResult, ChartSeries } from "../../../analytics/schemas/charting";
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

  it("uses the UI client identifier when provided", () => {
    expect(resolveUiClient("client1")).toBe("client1");
    expect(lookupCapacity("client1")).toBe(5);
  });

  it("maps table client1_compat to ui client1", () => {
    expect(resolveUiClient("client1_compat")).toBe("client1");
    expect(lookupCapacity("client1_compat")).toBe(5);
  });

  it("maps demodata client to ui client2", () => {
    expect(resolveUiClient("demodata0.client1")).toBe("client2");
    expect(lookupCapacity("demodata0.client1")).toBe(750);
  });

  it("throws for unknown clients", () => {
    expect(() => lookupCapacity("unknown-client")).toThrow("Unknown client for capacity usage");
  });
});

describe("vrm entrances/exits chips", () => {
  const baseSeries: ChartSeries = {
    id: "entrances",
    label: "Entrances",
    geometry: "line",
    unit: "events",
    data: [
      { x: "2024-01-01T00:00:00Z", value: 2 },
      { x: "2024-01-01T00:15:00Z", value: 3 },
    ],
  };

  const baseResult: ChartResult = {
    chartType: "single_value",
    xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
    series: [baseSeries],
    meta: { timezone: "UTC", summary: {} },
  };

  it("adds a 24h total chip for entrances", () => {
    const decorated = decorateResult(VRM_KPI_IDS.entrances, baseResult as any, "client1");
    expect(decorated.meta?.summary?.vrmChipText).toBe("5");
    expect(decorated.meta?.summary?.headlineValue).toBe(3);
  });

  it("adds a 24h total chip for exits", () => {
    const decorated = decorateResult(VRM_KPI_IDS.exits, baseResult as any, "client1");
    expect(decorated.meta?.summary?.vrmChipText).toBe("5");
    expect(decorated.meta?.summary?.headlineValue).toBe(3);
  });
});

describe("vrm capacity donut", () => {
  it("builds usage/peak/rem slices with capacity mapping", () => {
    const now = new Date();
    const prev = new Date(now.getTime() - 15 * 60 * 1000);

    const capacityResult = decorateResult(
      VRM_KPI_IDS.capacity,
      {
        chartType: "single_value",
        xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
        series: [
          {
            id: "occupancy",
            label: "Occupancy",
            geometry: "line",
            unit: "people",
            data: [
              { x: prev.toISOString(), y: 300 },
              { x: now.toISOString(), y: 450 },
            ],
          },
        ],
        meta: { timezone: "UTC", summary: {} },
      },
      "client2",
    );

    expect(capacityResult.chartType).toBe("categorical");
    expect(capacityResult.meta?.summary?.chartStyle).toBe("capacity_usage");
    const data = capacityResult.series[0].data;
    const values = data.map((point) => Math.round((point.value ?? point.y ?? 0) as number));
    expect(values).toEqual([60, 0, 40]);
    expect(Math.round((capacityResult.meta?.summary?.headlineValue as number) ?? 0)).toBe(60);
  });

  it("caps donut slices at 100 while keeping headline", () => {
    const now = new Date();
    const prev = new Date(now.getTime() - 15 * 60 * 1000);

    const capacityResult = decorateResult(
      VRM_KPI_IDS.capacity,
      {
        chartType: "single_value",
        xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
        series: [
          {
            id: "occupancy",
            label: "Occupancy",
            geometry: "line",
            unit: "people",
            data: [
              { x: prev.toISOString(), y: 800 },
              { x: now.toISOString(), y: 1200 },
            ],
          },
        ],
        meta: { timezone: "UTC", summary: {} },
      },
      "client2",
    );

    const data = capacityResult.series[0].data;
    const total = data.reduce((sum, point) => sum + Number(point.value ?? point.y ?? 0), 0);
    expect(Math.round(total)).toBe(100);
    expect(Math.round((capacityResult.meta?.summary?.headlineValue as number) ?? 0)).toBe(160);
  });

  it("resolves capacity per client without leaking between decorations", () => {
    const now = new Date();
    const prev = new Date(now.getTime() - 15 * 60 * 1000);
    const raw: ChartResult = {
      chartType: "single_value",
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      series: [
        {
          id: "occupancy",
          label: "Occupancy",
          geometry: "line",
          unit: "people",
          data: [
            { x: prev.toISOString(), y: 4 },
            { x: now.toISOString(), y: 4 },
          ],
        },
      ],
      meta: { timezone: "UTC", summary: {} },
    };

    const client1 = decorateResult(VRM_KPI_IDS.capacity, raw, "client1");
    const client2 = decorateResult(VRM_KPI_IDS.capacity, raw, "client2");

    expect(client1.meta?.summary?.vrmCapacity).toBe(5);
    expect(Math.round((client1.meta?.summary?.headlineValue as number) ?? 0)).toBe(80);

    expect(client2.meta?.summary?.vrmCapacity).toBe(750);
    expect(Math.round((client2.meta?.summary?.headlineValue as number) ?? 0)).toBe(1);

    const client1Slices = client1.series[0].data.map((point) => Number(point.value ?? point.y ?? 0));
    const client2Slices = client2.series[0].data.map((point) => Number(point.value ?? point.y ?? 0));

    expect(client1Slices).not.toEqual(client2Slices);
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

describe("vrm footfall delta", () => {
  it("exposes percent delta without vrm chip text", () => {
    const now = new Date();
    const prev = new Date(now.getTime() - 15 * 60 * 1000);
    const footfallResult: ChartResult = {
      chartType: "single_value",
      xDimension: { id: "timestamp", type: "time" },
      series: [
        {
          id: "footfall",
          label: "Footfall",
          geometry: "line",
          unit: "events",
          summary: { delta: 0.25 },
          data: [
            { x: prev.toISOString(), value: 200 },
            { x: now.toISOString(), value: 250 },
          ],
        },
      ],
      meta: { timezone: "UTC", summary: {} },
    };

    const decorated = decorateResult(VRM_KPI_IDS.footfall, footfallResult, "client1");
    expect(decorated.meta?.summary?.headlineValue).toBe(250);
    expect(decorated.meta?.summary?.vrmChipText).toBeUndefined();
  });
});
