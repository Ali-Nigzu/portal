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
        capacity_usage_now: 40,
        peak_capacity_usage_today: 50,
        capacity_usage_overflow_now: 0,
        peak_capacity_usage_overflow_today: 0,
      } as any,
    },
  };

  it("renders the base donut with three slices under capacity", () => {
    const tree = renderer.create(
      <CapacityDonut result={baseResult} series={baseResult.series} height={200} className="" />,
    );

    const pies = tree.root.findAllByType(Pie);
    expect(pies.length).toBe(1);
    const pie = pies[0];
    expect(pie.props.startAngle).toBe(90);
    expect(pie.props.endAngle).toBe(450);
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

  it("renders overflow as an outer ring when current exceeds capacity", () => {
    const overflowResult: ChartResult = {
      ...baseResult,
      series: [
        {
          ...baseResult.series[0],
          data: [
            { x: "Usage", value: 100 },
            { x: "Peak extra", value: 0 },
            { x: "Remaining", value: 0 },
          ],
        },
      ],
      meta: {
        ...baseResult.meta,
        summary: {
          ...(baseResult.meta?.summary as any),
          headlineValue: 141,
          capacity_usage_now: 141,
          peak_capacity_usage_today: 141,
          capacity_usage_overflow_now: 41,
          peak_capacity_usage_overflow_today: 41,
        },
      },
    };

    const tree = renderer.create(
      <CapacityDonut result={overflowResult} series={overflowResult.series} height={200} className="" />,
    );

    const pies = tree.root.findAllByType(Pie);
    expect(pies.length).toBe(2);
    const overflowPie = pies[1];
    const overflowData = overflowPie.props.data as Array<{ label: string; value: number; color: string }>;
    expect(overflowData.map((entry) => entry.label)).toEqual(["Current overflow"]);
    expect(overflowData[0].value).toBe(41);

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("141%");
    expect(json).toContain("+41% over");
  });

  it("persists peak overflow when peak > 100 but current is below", () => {
    const peakOverflowResult: ChartResult = {
      ...baseResult,
      series: [
        {
          ...baseResult.series[0],
          data: [
            { x: "Usage", value: 80 },
            { x: "Peak extra", value: 20 },
            { x: "Remaining", value: 0 },
          ],
        },
      ],
      meta: {
        ...baseResult.meta,
        summary: {
          ...(baseResult.meta?.summary as any),
          headlineValue: 80,
          capacity_usage_now: 80,
          peak_capacity_usage_today: 130,
          capacity_usage_overflow_now: 0,
          peak_capacity_usage_overflow_today: 30,
        },
      },
    };

    const tree = renderer.create(
      <CapacityDonut result={peakOverflowResult} series={peakOverflowResult.series} height={200} className="" />,
    );

    const pies = tree.root.findAllByType(Pie);
    expect(pies.length).toBe(2);
    const overflowPie = pies[1];
    const overflowData = overflowPie.props.data as Array<{ label: string; value: number; color: string }>;
    expect(overflowData.map((entry) => entry.label)).toEqual(["Peak overflow"]);
    expect(overflowData[0].value).toBe(30);

    const tooltip = tree.root.findByType(Tooltip);
    expect(
      tooltip.props.formatter(30, "value", { payload: { label: "Peak overflow" } }),
    ).toEqual(["30% peak over", "Peak overflow"]);
  });
});
