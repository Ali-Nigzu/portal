import { buildWidgetSpec } from "./buildWidgetSpec";
import type { DashboardWidget } from "../types";
import type { ChartSpec } from "../../../analytics/schemas/charting";

const baseSpec: ChartSpec = {
  id: "spec.test",
  dataset: "events",
  chartType: "single_value",
  measures: [{ id: "activity", aggregation: "count" }],
  dimensions: [
    {
      id: "timestamp",
      column: "timestamp",
      bucket: "HOUR",
      sort: "asc",
    },
  ],
  timeWindow: {
    from: "{{TODAY_START}}",
    to: "{{NOW}}",
    bucket: "HOUR",
    timezone: "UTC",
  },
};

const widget: DashboardWidget = {
  id: "widget-1",
  title: "Test widget",
  kind: "kpi",
  inlineSpec: baseSpec,
};

describe("buildWidgetSpec", () => {
  it("clones the inline spec and applies time overrides", () => {
    const anchor = new Date("2024-03-01T12:00:00.000Z");
    const option = {
      id: "last_hour",
      label: "Last 60 minutes",
      durationMinutes: 60,
      bucket: "15_MIN" as const,
    };

    const spec = buildWidgetSpec(widget, { timeRange: option, timezone: "UTC", anchor });

    expect(spec).not.toBe(baseSpec);
    expect(spec.timeWindow?.bucket).toBe("15_MIN");
    expect(spec.dimensions?.[0]?.bucket).toBe("15_MIN");
    expect(spec.timeWindow?.from).toBe("2024-03-01T11:00:00.000Z");
    expect(spec.timeWindow?.to).toBe("2024-03-01T12:00:00.000Z");
    expect(baseSpec.timeWindow?.from).toBe("{{TODAY_START}}");
  });

  it("throws when inline spec is missing", () => {
    expect(() => buildWidgetSpec({ ...widget, inlineSpec: undefined })).toThrow(
      /missing inline spec/,
    );
  });
});
