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

  it("formats percentage units with a % suffix", () => {
    const props = buildProps();
    props.series = [
      {
        id: "primary",
        label: "Primary",
        geometry: "metric",
        unit: "percentage",
        data: [{ x: "2024-01-01T00:00:00Z", value: 37 }],
      },
    ];
    props.result = {
      chartType: "single_value",
      series: props.series,
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      meta: { timezone: "UTC" },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    expect(valueNode.children.join(" ")).toContain("%");
  });
});
