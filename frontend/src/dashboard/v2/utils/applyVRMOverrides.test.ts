import { applyVRMOverrides, VRM_KPI_IDS, VRM_KPI_TITLES } from "./applyVRMOverrides";
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
    });
  });
});
