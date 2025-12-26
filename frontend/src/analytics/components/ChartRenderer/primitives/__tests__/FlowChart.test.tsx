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
    id: "occupancy_band_base",
    label: "Occupancy band base",
    geometry: "area",
    unit: "people",
    seriesGroup: "occupancy",
    data: [{ x: "2025-12-24T20:35:00Z", y: 10 }],
  },
  {
    id: "occupancy_band_span",
    label: "Occupancy (min–max)",
    geometry: "area",
    unit: "people",
    seriesGroup: "occupancy",
    data: [{ x: "2025-12-24T20:35:00Z", y: 10 }],
  },
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
      seriesIds: [
        "occupancy_band_base",
        "occupancy_band_span",
        "occupancy_min",
        "occupancy_max",
        "occupancy_avg",
      ],
    },
  ],
  bindings: {},
};

const visibility: SeriesVisibilityMap = {
  occupancy_band_base: true,
  occupancy_band_span: true,
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
    const areas = tree.root.findAllByType("area-mock");
    const areasByKey = new Map(areas.map((area) => [area.props.dataKey, area.props]));
    const tooltip = tree.root.findByType("tooltip-mock");
    const brush = tree.root.findByType("brush-mock");

    expect(byKey.get("occupancy_min")?.activeDot).toBe(false);
    expect(byKey.get("occupancy_max")?.activeDot).toBe(false);
    expect(typeof byKey.get("occupancy_avg")?.activeDot).toBe("function");
    expect(areasByKey.get("occupancy_band_base")?.activeDot).toBe(false);
    expect(areasByKey.get("occupancy_band_span")?.activeDot).toBe(false);
    expect(tooltip.props.cursor).toBe(false);
    expect(typeof brush.props.tickFormatter).toBe("function");

    const activeDot = byKey.get("occupancy_avg")?.activeDot as (props: any) => any;
    const renderedDot = activeDot({
      cx: 12,
      cy: 34,
      payload: { x: "2025-12-24T20:35:00Z" },
    });
    expect(renderedDot?.props?.r).toBeGreaterThan(0);
  });

  it("renders formatted Start/End labels outside the brush", () => {
    const tree = renderer.create(
      <FlowChart
        result={result}
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
    expect(text).not.toContain("T20:35:00Z");
  });
});
