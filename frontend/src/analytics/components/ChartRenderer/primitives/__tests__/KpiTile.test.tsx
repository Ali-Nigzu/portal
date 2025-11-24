/* eslint-disable testing-library/await-async-query */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { KpiTile } from "../KpiTile";
import type { ChartResult } from "../../../../schemas/charting";

jest.mock("recharts", () => {
  const MockAreaChart = ({ children, ...props }: any) => <area-chart-mock {...props}>{children}</area-chart-mock>;
  const MockResponsive = ({ children, ...props }: { children: React.ReactNode }) => (
    <responsive-container-mock {...props}>{children}</responsive-container-mock>
  );
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

    const responsive = tree.root.findByType("responsive-container-mock");
    expect(responsive.props.height).toBe(64);

    const areaChart = tree.root.findByType("area-chart-mock");
    expect(typeof areaChart.props.onMouseMove).toBe("function");

    const yAxis = tree.root.findByType("y-axis-mock");
    expect(Array.isArray(yAxis.props.domain)).toBe(true);
    expect(yAxis.props.domain[0]).toBe(0);
    expect(typeof yAxis.props.domain[1]).toBe("function");

    const sparkline = tree.root.find((node) => node.props.className?.includes("kpi-sparkline--vrm"));
    expect(sparkline.props.style).toBeUndefined();

    const tooltips = tree.root.findAllByType("tooltip-mock");
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0].props.wrapperStyle).toEqual({ visibility: "hidden", pointerEvents: "none" });

    act(() => {
      areaChart.props.onMouseMove({
        activePayload: [{ payload: { x: "2024-01-01T00:30:00Z", value: 2 } }],
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline popover");
    expect(JSON.stringify(json)).toContain("2");
  });

  it("falls back to activeLabel when payload is missing", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const areaChart = tree.root.findByType("area-chart-mock");
    act(() => {
      areaChart.props.onMouseMove({
        activeLabel: "2024-01-01T00:15:00Z",
        activePayload: [],
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline popover");
    expect(JSON.stringify(json)).toContain("3");
  });

  it("keeps hover when payload is missing but last index exists", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const areaChart = tree.root.findByType("area-chart-mock");
    act(() => {
      areaChart.props.onMouseMove({
        activeLabel: "2024-01-01T00:15:00Z",
        activePayload: [],
        activeTooltipIndex: 1,
      });
    });

    act(() => {
      areaChart.props.onMouseMove({
        activePayload: [],
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline popover");
    expect(JSON.stringify(json)).toContain("3");
  });

  it("derives index from chartX when no payload or label is provided", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const areaChart = tree.root.findByType("area-chart-mock");

    act(() => {
      areaChart.props.onMouseMove({
        activePayload: [],
        chartWidth: 300,
        chartX: 150,
      });
    });

    const jsonMid = tree.toJSON();
    expect(JSON.stringify(jsonMid)).toContain("VRM sparkline popover");
    expect(JSON.stringify(jsonMid)).toContain("3");

    act(() => {
      areaChart.props.onMouseMove({
        activePayload: [],
        chartWidth: 300,
        chartX: 295,
      });
    });

    const jsonEnd = tree.toJSON();
    expect(JSON.stringify(jsonEnd)).toContain("VRM sparkline popover");
    expect(JSON.stringify(jsonEnd)).toContain("2");
  });

  it("matches numeric activeLabel timestamps to sparkline points", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const areaChart = tree.root.findByType("area-chart-mock");
    act(() => {
      areaChart.props.onMouseMove({
        activeLabel: new Date("2024-01-01T00:15:00Z").valueOf(),
        activePayload: [],
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline popover");
    expect(JSON.stringify(json)).toContain("3");
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
