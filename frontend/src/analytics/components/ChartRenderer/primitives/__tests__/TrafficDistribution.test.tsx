/* eslint-disable testing-library/await-async-query */
import React from "react";
import renderer from "react-test-renderer";
import { Pie, Tooltip } from "recharts";

import type { ChartResult } from "../../../../schemas/charting";
import { TrafficDistribution } from "../TrafficDistribution";

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

describe("TrafficDistribution", () => {
  it("formats zero-total tooltips as 0%", () => {
    const result: ChartResult = {
      chartType: "categorical",
      xDimension: { id: "camera", type: "category" },
      series: [
        {
          id: "traffic_share",
          label: "Traffic by Camera",
          geometry: "bar",
          unit: "percentage",
          data: [{ x: "Cam 0", value: 0 }],
        },
      ],
      meta: { timezone: "UTC", summary: { presentation: "vrm", chartSubType: "traffic_distribution" } as any },
    };

    const tree = renderer.create(
      <TrafficDistribution result={result} series={result.series} height={140} className="" widgetId="kpi-vrm-traffic" />,
    );

    const tooltip = tree.root.findByType(Tooltip);
    const formatted = tooltip.props.formatter(1, "traffic_share", { payload: { displayValue: 0 } });
    expect(formatted).toBe("0%");

    const pie = tree.root.findByType(Pie);
    expect(pie.props.startAngle).toBe(90);
    expect(pie.props.endAngle).toBe(450);
    expect(pie.props.paddingAngle).toBe(0);
  });
});
