/* eslint-disable testing-library/await-async-query */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { KpiTile } from "../KpiTile";
import type { ChartResult } from "../../../../schemas/charting";

jest.mock("recharts", () => {
  const MockAreaChart = ({ children, ...props }: any) => <area-chart-mock {...props}>{children}</area-chart-mock>;
  const MockResponsive = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const MockArea = (props: any) => <area-mock {...props} />;
  const MockTooltip = (props: any) => <tooltip-mock {...props} />;
  const MockYAxis = (props: any) => <y-axis-mock {...props} />;
  return {
    ResponsiveContainer: MockResponsive,
    AreaChart: MockAreaChart,
    Area: MockArea,
    Tooltip: MockTooltip,
    YAxis: MockYAxis,
  } as typeof import("recharts");
});

const buildResult = (presentation: "vrm" | "default" = "vrm"): {
  result: ChartResult;
  series: ChartResult["series"];
} => {
  const series = [
    {
      id: "entrances",
      label: "Entrances",
      geometry: "line",
      unit: "events",
      data: [
        { x: "2024-01-01T00:00:00Z", value: 1 },
        { x: "2024-01-01T00:15:00Z", value: 3 },
        { x: "2024-01-01T00:30:00Z", value: 2 },
      ],
      summary: { delta: 0.2 },
    },
  ];

  const result: ChartResult = {
    chartType: "single_value",
    xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
    series,
    meta: { timezone: "UTC", summary: { presentation, title: "Entrances" } },
  };

  return { result, series };
};

describe("KpiTile VRM sparkline", () => {
  it("renders baseline anchored to 0 and drop-up popover", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const areaChart = tree.root.findByType("area-chart-mock");
    expect(typeof areaChart.props.onMouseMove).toBe("function");

    const yAxis = tree.root.findByType("y-axis-mock");
    expect(yAxis.props.domain).toEqual([0, "auto"]);

    const tooltips = tree.root.findAllByType("tooltip-mock");
    expect(tooltips).toHaveLength(0);

    act(() => {
      areaChart.props.onMouseMove({
        activePayload: [{ payload: { x: "2024-01-01T00:30:00Z", value: 2 } }],
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline popover");
    expect(JSON.stringify(json)).toContain("2");
  });

  it("keeps default tooltip for non-VRM charts", () => {
    const built = buildResult("default");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const tooltips = tree.root.findAllByType("tooltip-mock");
    expect(tooltips).toHaveLength(1);
  });
});
