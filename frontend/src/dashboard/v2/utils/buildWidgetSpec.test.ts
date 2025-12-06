import { describe, expect, it } from "@jest/globals";
import { buildWidgetSpec } from "./buildWidgetSpec";
import type { DashboardWidget, DashboardTimeRangeOption } from "../types";

const baseWidget: DashboardWidget = {
  id: "live-flow",
  title: "Site Flow",
  kind: "chart",
  inlineSpec: {
    id: "dashboard.live_flow",
    dataset: "events",
    chartType: "composed_time",
    measures: [{ id: "occupancy", aggregation: "occupancy_recursion" }],
    dimensions: [
      {
        id: "timestamp",
        column: "timestamp",
        bucket: "5_MIN",
        sort: "asc",
      },
    ],
    timeWindow: {
      from: "{{NOW_MINUS_60_MIN}}",
      to: "{{NOW}}",
      bucket: "5_MIN",
      timezone: "UTC",
    },
  },
};

describe("buildWidgetSpec", () => {
  it("applies the dashboard time range to the inline spec", () => {
    const option: DashboardTimeRangeOption = {
      id: "all_time",
      label: "All time",
      durationMinutes: null,
      bucket: "WEEK",
      allTime: true,
    };

    const anchor = new Date("2024-02-01T00:00:00Z");
    const spec = buildWidgetSpec(baseWidget, { timeRange: option, anchor });

    expect(spec.timeWindow?.from).toBe(new Date(0).toISOString());
    expect(spec.timeWindow?.to).toBe(anchor.toISOString());
    expect(spec.timeWindow?.bucket).toBe("WEEK");
    expect(spec.dimensions?.find((d) => d.id === "timestamp")?.bucket).toBe("WEEK");

    // original widget inline spec remains unchanged
    expect(baseWidget.inlineSpec?.timeWindow?.from).toBe("{{NOW_MINUS_60_MIN}}");
    expect(baseWidget.inlineSpec?.dimensions?.[0]?.bucket).toBe("5_MIN");
  });
});
