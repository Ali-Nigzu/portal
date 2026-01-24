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
  const MockXAxis = (props: any) => <x-axis-mock {...props} />;
  const MockReferenceDot = (props: any) => <reference-dot-mock {...props} />;
  return {
    ResponsiveContainer: MockResponsive,
    AreaChart: MockAreaChart,
    Area: MockArea,
    Tooltip: MockTooltip,
    YAxis: MockYAxis,
    XAxis: MockXAxis,
    ReferenceDot: MockReferenceDot,
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
  it("renders baseline anchored to 0 and VRM drawer popover", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const responsive = tree.root.findByType("responsive-container-mock");
    expect(responsive.props.height).toBe(64);

    const areaChart = tree.root.findByType("area-chart-mock");
    expect(areaChart.props.onMouseMove).toBeUndefined();

    const yAxis = tree.root.findByType("y-axis-mock");
    expect(Array.isArray(yAxis.props.domain)).toBe(true);
    expect(typeof yAxis.props.domain[0]).toBe("function");
    expect(yAxis.props.domain[0](5)).toBe(0);
    expect(typeof yAxis.props.domain[1]).toBe("function");
    expect(yAxis.props.domain[1](-5)).toBe(0);

    const sparkline = tree.root.find((node) => node.props.className?.includes("kpi-sparkline-anchor--vrm"));
    expect(sparkline.props.style).toEqual({ paddingBottom: 0 });

    const tooltips = tree.root.findAllByType("tooltip-mock");
    expect(tooltips).toHaveLength(0);
    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");

    act(() => {
      overlay.props.onMouseMove({
        clientX: 300,
        currentTarget: { getBoundingClientRect: () => ({ width: 300, left: 0 }) },
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline hover strip");
    expect(JSON.stringify(json)).toContain("2");
  });

  it("computes hover from overlay midpoint", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");
    act(() => {
      overlay.props.onMouseMove({
        clientX: 150,
        currentTarget: { getBoundingClientRect: () => ({ width: 300, left: 0 }) },
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline hover strip");
    expect(JSON.stringify(json)).toContain("3");
  });

  it("uses overlay hover when tooltip metadata is absent", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");

    act(() => {
      overlay.props.onMouseMove({
        clientX: 150,
        currentTarget: { getBoundingClientRect: () => ({ width: 300, left: 0 }) },
      });
    });

    const popover = tree.root.findByProps({ "aria-label": "VRM sparkline hover strip" });
    expect(popover.props.className).toContain("kpi-sparkline-strip--vrm");

    let cursor: any = popover.parent;
    let anchored = false;
    while (cursor) {
      if (cursor.props?.className?.includes("kpi-sparkline-region--vrm")) {
        anchored = true;
        break;
      }
      cursor = cursor.parent;
    }

    expect(anchored).toBe(true);
    expect(popover.parent?.props?.className).toContain("kpi-sparkline-region");
  });

  it("clamps overlay hover to the first bucket", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");
    act(() => {
      overlay.props.onMouseMove({
        clientX: -50,
        currentTarget: { getBoundingClientRect: () => ({ width: 300, left: 0 }) },
      });
    });

    const json = tree.toJSON();
    expect(JSON.stringify(json)).toContain("VRM sparkline hover strip");
    expect(JSON.stringify(json)).toContain("1");
  });

  it("renders a single VRM overlay and popover within the sparkline shell", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");

    act(() => {
      overlay.props.onMouseMove({
        clientX: 150,
        currentTarget: { getBoundingClientRect: () => ({ width: 300, left: 0 }) },
      });
    });

    const overlays = tree.root.findAll((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");
    expect(overlays).toHaveLength(1);

    const popovers = tree.root.findAllByProps({ "aria-label": "VRM sparkline hover strip" });
    expect(popovers).toHaveLength(1);

    let cursor: any = popovers[0]?.parent;
    let anchoredToShell = false;
    while (cursor) {
      if (typeof cursor.props?.className === "string" && cursor.props.className.includes("kpi-sparkline-region--vrm")) {
        anchoredToShell = true;
        break;
      }
      cursor = cursor.parent;
    }

    expect(anchoredToShell).toBe(true);
  });

  it("renders a visible VRM hover dot with contrast styling", () => {
    const built = buildResult("vrm");
    if (!built) throw new Error("missing data");
    const tree = renderer.create(
      <KpiTile result={built.result} series={built.series} height={200} className="" />,
    );

    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");
    act(() => {
      overlay.props.onMouseMove({
        clientX: 225,
        currentTarget: { getBoundingClientRect: () => ({ width: 300, left: 0 }) },
      });
    });

    const dots = tree.root.findAllByType("reference-dot-mock");
    expect(dots).toHaveLength(1);
    expect(dots[0].props.r).toBe(3.5);
    expect(dots[0].props.fill).toBe("rgba(255,255,255,0.1)");
    expect(dots[0].props.strokeWidth).toBe(1.5);
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
