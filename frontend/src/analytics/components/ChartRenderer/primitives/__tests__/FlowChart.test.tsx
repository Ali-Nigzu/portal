/* eslint-disable testing-library/await-async-query */
import React from "react";
import renderer from "react-test-renderer";

import type { ChartResult, ChartSeries } from "../../../../schemas/charting";
import type { AxisConfig, SeriesVisibilityMap } from "../../managers";
import { FlowChart } from "../FlowChart";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <responsive-container-mock>{children}</responsive-container-mock>
  ),
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <composed-chart-mock>{children}</composed-chart-mock>
  ),
  XAxis: (props: any) => <x-axis-mock {...props} />,
  YAxis: (props: any) => <y-axis-mock {...props} />,
  CartesianGrid: (props: any) => <cartesian-grid-mock {...props} />,
  Tooltip: (props: any) => <tooltip-mock {...props} />,
  Line: (props: any) => <line-mock {...props} />,
  Area: (props: any) => <area-mock {...props} />,
  Bar: (props: any) => <bar-mock {...props} />,
  Brush: (props: any) => <brush-mock {...props} />,
}));

const series: ChartSeries[] = [
  {
    id: "occupancy_min",
    label: "Occupancy (min)",
    geometry: "line",
    unit: "people",
    seriesGroup: "occupancy",
    noDots: true,
    data: [{ x: "2025-12-24T20:35:00Z", y: 10 }],
  },
  {
    id: "occupancy_max",
    label: "Occupancy (max)",
    geometry: "line",
    unit: "people",
    seriesGroup: "occupancy",
    noDots: true,
    data: [{ x: "2025-12-24T20:35:00Z", y: 20 }],
  },
  {
    id: "occupancy_avg",
    label: "Occupancy (avg)",
    geometry: "line",
    unit: "people",
    seriesGroup: "occupancy",
    noDots: true,
    data: [{ x: "2025-12-24T20:35:00Z", y: 15 }],
  },
];

const axisConfig: AxisConfig = {
  axes: [
    {
      id: "Y1",
      unit: "people",
      visible: true,
      seriesIds: ["occupancy_min", "occupancy_max", "occupancy_avg"],
    },
  ],
  bindings: {},
};

const visibility: SeriesVisibilityMap = {
  occupancy_min: true,
  occupancy_max: true,
  occupancy_avg: true,
};

const result: ChartResult = {
  chartType: "composed_time",
  xDimension: { id: "timestamp", type: "time", bucket: "HOUR", timezone: "UTC" },
  series,
  meta: { timezone: "UTC", summary: { title: "Site Flow" } },
};

describe("FlowChart occupancy hover dots", () => {
  it("enables a single active dot for occupancy_avg only", () => {
    const tree = renderer.create(
      <FlowChart
        result={result}
        series={series}
        axisConfig={axisConfig}
        visibility={visibility}
        height={200}
      />,
    );

    const lines = tree.root.findAllByType("line-mock");
    const byKey = new Map(lines.map((line) => [line.props.dataKey, line.props]));

    expect(byKey.get("occupancy_min")?.activeDot).toBe(false);
    expect(byKey.get("occupancy_max")?.activeDot).toBe(false);
    expect(typeof byKey.get("occupancy_avg")?.activeDot).toBe("function");
  });
});
