import React from "react";
import { jest } from "@jest/globals";
import renderer from "react-test-renderer";
import { KpiTile } from "./KpiTile";
import type { ChartPrimitiveProps } from "./types";
import type { ChartResult, ChartSeries } from "../../../schemas/charting";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => <div>area</div>,
  Tooltip: () => null,
}));

const buildProps = (overrides?: Partial<ChartPrimitiveProps>): ChartPrimitiveProps => {
  const series: ChartSeries[] = [
    {
      id: "primary",
      label: "Primary",
      geometry: "metric",
      unit: "events",
      data: [
        { x: "2024-01-01T00:00:00Z", value: 10, coverage: 1, rawCount: 10 },
        { x: "2024-01-01T00:15:00Z", value: 12, coverage: 0.9, rawCount: 12 },
      ],
    },
  ];
  const result: ChartResult = {
    chartType: "single_value",
    xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
    series,
    meta: { timezone: "UTC" },
  };
  return {
    result,
    series,
    axisConfig: { axes: [], bindings: {} },
    visibility: { primary: true },
    height: 200,
    ...overrides,
  } as ChartPrimitiveProps;
};

describe("KpiTile", () => {
  it("hides raw and coverage metadata when compact", () => {
    const props = buildProps();
    props.result.meta = {
      summary: { compact: true } as unknown as ChartResult["meta"]["summary"],
      timezone: "UTC",
    } as ChartResult["meta"];
    const tree = renderer.create(<KpiTile {...props} />).toJSON();
    const text = JSON.stringify(tree);
    expect(text).not.toContain("raw:");
    expect(text).not.toContain("coverage:");
  });

  it("shows numeric-only KPI values with uppercase unit label", () => {
    const tree = renderer.create(<KpiTile {...buildProps()} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    const unitNode = tree.findByProps({ className: "kpi-unit" });
    expect(valueNode.children.join(" ")).toBe("12");
    expect(unitNode.children.join(" ")).toBe("EVENTS");
    expect(valueNode.children.join(" ")).not.toContain("events");
  });

  it("renders minutes KPIs without repeating the unit", () => {
    const props = buildProps({
      series: [
        {
          id: "primary",
          label: "Dwell",
          geometry: "metric",
          unit: "minutes",
          data: [
            { x: "2024-01-01T00:00:00Z", value: 20 },
            { x: "2024-01-01T00:15:00Z", value: 23.87 },
          ],
        },
      ],
    });
    props.result = {
      chartType: "single_value",
      series: props.series,
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      meta: { timezone: "UTC" },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    const unitNode = tree.findByProps({ className: "kpi-unit" });
    expect(valueNode.children.join(" ")).toBe("23.87");
    expect(unitNode.children.join(" ")).toBe("MINUTES");
    expect(valueNode.children.join(" ")).not.toContain("minutes");
  });

  it("formats percentage KPIs with a % suffix and uppercase label", () => {
    const props = buildProps({
      series: [
        {
          id: "primary",
          label: "Capacity usage",
          geometry: "metric",
          unit: "percentage",
          data: [{ x: "2024-01-01T00:15:00Z", value: 53 }],
        },
      ],
    });
    props.result = {
      chartType: "single_value",
      series: props.series,
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      meta: { timezone: "UTC" },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    const unitNode = tree.findByProps({ className: "kpi-unit" });
    expect(valueNode.children.join(" ")).toBe("53%");
    expect(unitNode.children.join(" ")).toBe("PERCENTAGE");
  });
});
