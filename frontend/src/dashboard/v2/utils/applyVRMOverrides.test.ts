import { applyVRMOverrides, VRM_KPI_IDS, VRM_KPI_TITLES } from "./applyVRMOverrides";
import {
  decorateResult,
  getCapacityUsageHeadline,
  getFootfallHeadline,
  lastBucketValue,
} from "./vrmDecorators";
import type { DashboardManifest } from "../types";

const buildManifest = (): DashboardManifest => ({
  id: "dashboard-default",
  orgId: "client0",
  widgets: [
    {
      id: "kpi-activity",
      title: "Activity Today",
      kind: "kpi",
      inlineSpec: {
        id: "kpi-activity",
        dataset: "events",
        measures: [{ aggregation: "count", id: "activity" }],
        dimensions: [{ id: "time", column: "timestamp", bucket: "15_MIN" }],
        timeWindow: { from: "{{NOW_MINUS_24_HOURS}}", to: "{{NOW}}", bucket: "15_MIN" },
        chartType: "single_value",
      },
    },
    {
      id: "kpi-entrances",
      title: "Entrances Today",
      kind: "kpi",
      inlineSpec: {
        id: "kpi-entrances",
        dataset: "events",
        measures: [{ aggregation: "count", id: "entrances" }],
        dimensions: [{ id: "time", column: "timestamp", bucket: "15_MIN" }],
        timeWindow: { from: "{{NOW_MINUS_24_HOURS}}", to: "{{NOW}}", bucket: "15_MIN" },
        chartType: "single_value",
      },
    },
    {
      id: "chart-1",
      title: "Chart",
      kind: "chart",
      inlineSpec: {
        id: "chart-1",
        dataset: "events",
        measures: [{ aggregation: "count", id: "events" }],
        dimensions: [{ id: "time", column: "timestamp", bucket: "15_MIN" }],
        timeWindow: { from: "{{NOW_MINUS_24_HOURS}}", to: "{{NOW}}", bucket: "15_MIN" },
        chartType: "composed_time",
      },
    },
  ],
  layout: {
    kpiBand: ["kpi-activity", "kpi-entrances"],
    grid: { columns: 12, placements: {} },
  },
  timeControls: {
    defaultTimeRangeId: "all_time",
    timezone: "UTC",
    options: [
      { id: "all_time", label: "All time", bucket: "HOUR", durationMinutes: null, allTime: true },
      { id: "last_24_hours", label: "Last 24 hours", bucket: "15_MIN", durationMinutes: 24 * 60 },
    ],
  },
});

describe("applyVRMOverrides", () => {
  it("replaces KPI band with seven VRM widgets and fixed windows", () => {
    const manifest = buildManifest();
    const updated = applyVRMOverrides(manifest);

    const vrmIds = Object.values(VRM_KPI_IDS) as string[];

    expect(updated.layout.kpiBand).toEqual(Object.values(VRM_KPI_IDS));
    const widgetIds = updated.widgets.map((widget) => widget.id);
    Object.values(VRM_KPI_IDS).forEach((id) => expect(widgetIds).toContain(id));

    const vrmWidgets = updated.widgets.filter((widget) => vrmIds.includes(widget.id));
    expect(vrmWidgets).toHaveLength(7);
    vrmWidgets.forEach((widget) => {
      expect(widget.fixedTimeWindow).toEqual({ bucket: "15_MIN", durationMinutes: 1440 });
      expect(widget.title).toBe(VRM_KPI_TITLES[widget.id]);
      expect(widget.inlineSpec?.timeWindow?.bucket).toBe("15_MIN");
      expect(widget.inlineSpec?.timeWindow?.from).toBe("{{NOW_MINUS_24_HOURS}}");
      if (widget.id === VRM_KPI_IDS.traffic) {
        expect(widget.inlineSpec?.splits?.[0]?.id).toBe("camera_id");
        expect(widget.inlineSpec?.dimensions?.[0]?.id).toBe("timestamp");
      }
    });
  });

  it("forces VRM KPI headlines to come from the last 15-minute bucket instead of summary totals", () => {
    const buildResult = (values: number[], widgetId: string) =>
      decorateResult(
        widgetId,
        {
          chartType: "single_value",
          xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
          series: [
            {
              id: widgetId,
              label: widgetId,
              geometry: "line",
              unit: "events",
              data: [
                { x: "2024-01-01T00:00:00Z", y: values[0] },
                { x: "2024-01-01T00:15:00Z", y: values[1] },
              ],
            },
          ],
          meta: { timezone: "UTC", summary: { total: 9999 } },
        },
        "client1",
      );

    const entrances = buildResult([2, 5], VRM_KPI_IDS.entrances);
    const exits = buildResult([3, 7], VRM_KPI_IDS.exits);
    const dwell = decorateResult(
      VRM_KPI_IDS.dwell,
      {
        chartType: "single_value",
        xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
        series: [
          {
            id: "dwell",
            label: "dwell",
            geometry: "line",
            unit: "minutes",
            data: [
              { x: "2024-01-01T00:00:00Z", y: 1.25 },
              { x: "2024-01-01T00:15:00Z", y: 3.5 },
            ],
          },
        ],
        meta: { timezone: "UTC", summary: { total: 9999 } },
      },
      "client1",
    );

    expect(entrances.meta?.summary?.headlineValue).toBe(5);
    expect(lastBucketValue(entrances.series[0])).toBe(5);
    expect(exits.meta?.summary?.headlineValue).toBe(7);
    expect(lastBucketValue(exits.series[0])).toBe(7);
    expect(dwell.meta?.summary?.headlineValue).toBeCloseTo(3.5);
  });

  it("derives footfall and capacity usage from last bucket values", () => {
    const now = new Date();
    const prev = new Date(now.getTime() - 15 * 60 * 1000);

    const footfallResult = decorateResult(
      VRM_KPI_IDS.footfall,
      {
        chartType: "single_value",
        xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
        series: [
          {
            id: "footfall",
            label: "Footfall",
            geometry: "line",
            unit: "events",
            data: [
              { x: prev.toISOString(), y: 6 },
              { x: now.toISOString(), y: 9 },
            ],
          },
        ],
        meta: { timezone: "UTC", summary: { total: 9999 } },
      },
      "client1",
    );

    const rawCapacityResult = {
      chartType: "single_value",
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      series: [
        {
          id: "occupancy",
          label: "Occupancy",
          geometry: "line",
          unit: "people",
          data: [
            { x: prev.toISOString(), y: 10 },
            { x: now.toISOString(), y: 9 },
          ],
        },
      ],
      meta: { timezone: "UTC", summary: { total: 9999 } },
    } as const;

    const capacityResult = decorateResult(VRM_KPI_IDS.capacity, rawCapacityResult as any, "client1");

    const footfallHeadline = getFootfallHeadline(footfallResult);
    expect(footfallHeadline.lastBucket).toBe(9);
    expect(footfallHeadline.total24h).toBe(15);
    expect(footfallResult.meta?.summary?.headlineValue).toBe(9);
    expect(footfallResult.meta?.summary?.secondaryText).toContain("Today’s footfall: 15");
    expect(footfallResult.meta?.summary?.tertiaryText).toContain("24h total: 15");

    const capacityHeadline = getCapacityUsageHeadline(rawCapacityResult as any, "client1");
    expect(capacityHeadline.currentUsage).toBe(90);
    expect(capacityHeadline.peakToday).toBe(100);
    expect(capacityResult.meta?.summary?.headlineValue).toBe(90);
    expect(capacityResult.meta?.summary?.secondaryText).toContain("Peak today:");
    expect(capacityResult.meta?.summary?.hideDelta).toBeTruthy();
  });

  it("uses UI client identifiers for capacity mapping", () => {
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
              { x: prev.toISOString(), y: 320 },
              { x: now.toISOString(), y: 327 },
            ],
          },
        ],
        meta: { timezone: "UTC", summary: {} },
      },
      "client2",
    );

    const headline = getCapacityUsageHeadline(capacityResult as any, "client2");
    expect(Math.round(headline.currentUsage ?? 0)).toBe(327);
    expect(capacityResult.meta?.summary?.peak_capacity_usage_today).toBeGreaterThan(0);
  });

  it("converts traffic distribution into per-camera shares", () => {
    const traffic = decorateResult(
      VRM_KPI_IDS.traffic,
      {
        chartType: "categorical",
        xDimension: { id: "camera_id", type: "category" },
        series: [
          {
            id: "events",
            label: "Events",
            geometry: "bar",
            data: [
              { x: "cam0", y: 10 },
              { x: "cam1", y: 5 },
            ],
          },
        ],
        meta: { timezone: "UTC", summary: {} },
      },
      "client1",
    );

    const data = traffic.series[0]?.data ?? [];
    expect(Math.round(data[0]?.value ?? 0)).toBe(67);
    expect(Math.round(data[1]?.value ?? 0)).toBe(33);
    expect(traffic.meta?.summary?.chartSubType).toBe("traffic_distribution");
    expect(traffic.meta?.summary?.hideDelta).toBeTruthy();
  });

  it("computes top camera share for traffic distribution from the last bucket", () => {
    const now = new Date();
    const prev = new Date(now.getTime() - 15 * 60 * 1000);

    const trafficResult = decorateResult(
      VRM_KPI_IDS.traffic,
      {
        chartType: "composed_time",
        xDimension: { id: "timestamp", type: "time", bucket: "15_MIN", timezone: "UTC" },
        series: [
          {
            id: "cam0",
            label: "Cam 0",
            geometry: "line",
            unit: "events",
            data: [
              { x: prev.toISOString(), y: 5 },
              { x: now.toISOString(), y: 10 },
            ],
          },
          {
            id: "cam1",
            label: "Cam 1",
            geometry: "line",
            unit: "events",
            data: [
              { x: prev.toISOString(), y: 5 },
              { x: now.toISOString(), y: 5 },
            ],
          },
        ],
        meta: { timezone: "UTC", summary: { total: 30 } },
      } as any,
      "client1",
    );

    expect(trafficResult.chartType).toBe("categorical");
    const series = trafficResult.series[0];
    expect(series.data).toHaveLength(2);
    expect(series.data.map((point) => Math.round((point.y ?? point.value ?? 0) as number))).toEqual([67, 33]);
    expect(trafficResult.meta?.summary?.headlineValue).toBeCloseTo(66.6667);
    expect((trafficResult.meta?.summary as any)?.chartStyle).toBe("traffic_distribution");
  });
});
