import { validateChartResult } from "../validation";
import type { ChartResult } from "../../../schemas/charting";
import retentionFixture from "../../../examples/golden_retention_heatmap.json";

describe("validateChartResult", () => {
  const baseTimeResult: ChartResult = {
    chartType: "composed_time",
    xDimension: { id: "time", type: "time", bucket: "HOUR", timezone: "UTC" },
    series: [
      {
        id: "occupancy",
        label: "Occupancy",
        geometry: "line",
        unit: "people",
        data: [
          { x: "2024-01-01T00:00:00Z", y: 10, coverage: 1 },
          { x: "2024-01-01T01:00:00Z", y: 12, coverage: 0.9 },
        ],
      },
    ],
    meta: { timezone: "UTC" },
  };

  it("flags unsupported units", () => {
    const result: ChartResult = {
      ...baseTimeResult,
      series: [
        {
          ...baseTimeResult.series[0],
          unit: "watts" as unknown as ChartResult["series"][number]["unit"],
        },
      ],
    };

    const issues = validateChartResult(result);
    expect(issues.some((issue) => issue.code === "unsupported_unit")).toBe(true);
  });

  it("detects coverage outside of 0-1", () => {
    const result: ChartResult = {
      ...baseTimeResult,
      series: [
        {
          ...baseTimeResult.series[0],
          data: [
            { x: "2024-01-01T00:00:00Z", y: 10, coverage: 1.2 },
            { x: "2024-01-01T01:00:00Z", y: 12, coverage: -0.2 },
          ],
        },
      ],
    };

    const issues = validateChartResult(result);
    expect(issues.filter((issue) => issue.code === "coverage_range")).toHaveLength(2);
  });

  it("allows canonical heatmap structures", () => {
    const heatmap: ChartResult = {
      chartType: "heatmap",
      xDimension: { id: "cohort", type: "matrix" },
      series: [
        {
          id: "retention",
          label: "Retention",
          geometry: "heatmap",
          unit: "percentage",
          data: [
            { x: "Week 0", group: "Week 0", value: 1, coverage: 1 },
            { x: "Week 1", group: "Week 0", value: 0.6, coverage: 0.5 },
            { x: "Week 0", group: "Week 1", value: 0.8, coverage: 0.9 },
            { x: "Week 1", group: "Week 1", value: 0.4, coverage: 0.4 },
          ],
        },
      ],
      meta: { timezone: "UTC" },
    };

    const issues = validateChartResult(heatmap);
    expect(issues).toHaveLength(0);
  });

  it("accepts the retention heatmap preset fixture", () => {
    const issues = validateChartResult(retentionFixture as ChartResult);
    expect(issues).toHaveLength(0);
  });

  it("flags heatmap gaps", () => {
    const heatmap: ChartResult = {
      chartType: "heatmap",
      xDimension: { id: "cohort", type: "matrix" },
      series: [
        {
          id: "retention",
          label: "Retention",
          geometry: "heatmap",
          unit: "percentage",
          data: [
            { x: "Week 0", group: "Week 0", value: 1 },
            { x: "Week 1", group: "Week 0", value: 0.82 },
            { x: "Week 0", group: "Week 1", value: 0.8 },
          ],
        },
      ],
      meta: { timezone: "UTC" },
    };

    const issues = validateChartResult(heatmap);
    expect(issues.some((issue) => issue.code === "heatmap_grid_gap")).toBe(true);
  });
});
