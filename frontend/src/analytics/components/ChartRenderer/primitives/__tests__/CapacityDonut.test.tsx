/* eslint-disable testing-library/await-async-query */
import React from "react";
import renderer from "react-test-renderer";
import { Pie, Cell, Tooltip } from "recharts";

import type { ChartResult } from "../../../../schemas/charting";
import { CapacityDonut } from "../CapacityDonut";

jest.mock("recharts", () => {
  const MockPie = (props: any) => <pie-mock {...props}>{props.children}</pie-mock>;
  const MockPieChart = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const MockCell = (props: any) => <cell-mock {...props} />;
  const MockTooltip = (props: any) => <tooltip-mock {...props} />;
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PieChart: MockPieChart,
    Pie: MockPie,
    Cell: MockCell,
    Tooltip: MockTooltip,
  } as typeof import("recharts");
});

describe("CapacityDonut", () => {
  const baseResult: ChartResult = {
    chartType: "categorical",
    xDimension: { id: "capacity_segment", type: "category" },
    series: [
      {
        id: "capacity",
        label: "Capacity usage",
        geometry: "bar",
        unit: "percentage",
        data: [
          { x: "Usage", value: 40 },
          { x: "Peak extra", value: 10 },
          { x: "Remaining", value: 50 },
        ],
      },
    ],
    meta: {
      timezone: "UTC",
      summary: {
        presentation: "vrm",
        chartStyle: "capacity_usage",
        headlineValue: 40,
        peak_capacity_usage_today: 50,
      } as any,
    },
  };

  it("renders an anti-clockwise seamless donut with VRM slices and tooltips", () => {
    const tree = renderer.create(
      <CapacityDonut result={baseResult} series={baseResult.series} height={200} className="" />,
    );

    const pie = tree.root.findByType(Pie);
    expect(pie.props.startAngle).toBe(90);
    expect(pie.props.endAngle).toBe(-270);
    expect(pie.props.paddingAngle).toBe(0);
    expect(pie.props.stroke).toBe("none");

    const pieData = pie.props.data as Array<{ label: string; value: number; color: string }>;
    expect(pieData.map((entry) => entry.label)).toEqual(["Usage", "Peak extra", "Remaining"]);
    expect(Math.round(pieData.reduce((sum, entry) => sum + entry.value, 0))).toBe(100);
    expect(pieData.map((entry) => entry.color)).toEqual(["#2d6cdf", "#f97066", "#2f3b52"]);

    const cells = tree.root.findAllByType(Cell);
    expect(cells.length).toBe(3);
    cells.forEach((cell) => expect(cell.props.stroke).toBe("none"));

    const tooltip = tree.root.findByType(Tooltip);
    expect(tooltip.props.formatter(40, "value", { payload: { label: "Usage" } })).toEqual([
      "40%",
      "Current",
    ]);
    expect(
      tooltip.props.formatter(10, "value", { payload: { label: "Peak extra" } }),
    ).toEqual(["10%", "Peak add-on"]);
    expect(
      tooltip.props.formatter(50, "value", { payload: { label: "Remaining" } }),
    ).toEqual(["50% (capacity not reached)", "Remaining"]);

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("capacity-usage__center");
    expect(json).toContain("40%");
    expect(json).not.toContain("capacity-usage__subtitle");
  });
});
