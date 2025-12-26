/* eslint-disable testing-library/await-async-query */
import React from "react";
import renderer from "react-test-renderer";

import type { ChartSeries } from "../../../../schemas/charting";
import type { AxisConfig, SeriesVisibilityMap } from "../../managers";
import { TimeSeriesChart } from "../TimeSeriesChart";

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
    id: "throughput",
    label: "Throughput",
    geometry: "line",
    unit: "events/min",
    data: [{ x: "2025-12-21T20:00:00Z", y: 10 }],
  },
];

const axisConfig: AxisConfig = {
  axes: [
    {
      id: "Y1",
      unit: "events/min",
      visible: true,
      seriesIds: ["throughput"],
    },
  ],
  bindings: {},
};

const visibility: SeriesVisibilityMap = {
  throughput: true,
};

describe("TimeSeriesChart brush labels", () => {
  it("renders formatted Start/End labels outside the brush", () => {
    const tree = renderer.create(
      <TimeSeriesChart
        result={{} as any}
        series={series}
        axisConfig={axisConfig}
        visibility={visibility}
        height={200}
      />,
    );

    const collectText = (node: renderer.ReactTestRendererJSON | renderer.ReactTestRendererJSON[] | string | null): string[] => {
      if (!node) {
        return [];
      }
      if (typeof node === "string") {
        return [node];
      }
      if (Array.isArray(node)) {
        return node.flatMap(collectText);
      }
      return (node.children ?? []).flatMap(collectText);
    };

    const text = collectText(tree.toJSON()).join(" ");
    expect(text).toContain("Start");
    expect(text).toContain("End");
    expect(text).not.toContain("T20:00:00Z");
  });
});
