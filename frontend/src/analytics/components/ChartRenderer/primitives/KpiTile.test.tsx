/* eslint-disable testing-library/await-async-query */
import React from "react";
import { jest } from "@jest/globals";
import renderer, { act } from "react-test-renderer";
import { KpiTile } from "./KpiTile";
import type { ChartPrimitiveProps } from "./types";
import type { ChartResult, ChartSeries } from "../../../schemas/charting";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => <div>area</div>,
  XAxis: () => <div>x-axis</div>,
  YAxis: () => <div>y-axis</div>,
  ReferenceDot: () => <div>reference-dot</div>,
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

  it("shows numeric-only KPI values with uppercase unit label", () => {
    const tree = renderer.create(<KpiTile {...buildProps()} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    const unitNode = tree.findByProps({ className: "kpi-unit" });
    expect(valueNode.children.join(" ")).toBe("12");
    expect(unitNode.children.join(" ")).toBe("EVENTS");
    expect(valueNode.children.join(" ")).not.toContain("events");
  });

  it("renders minutes KPIs without repeating the unit", () => {
    const props = buildProps({
      series: [
        {
          id: "primary",
          label: "Dwell",
          geometry: "metric",
          unit: "minutes",
          data: [
            { x: "2024-01-01T00:00:00Z", value: 20 },
            { x: "2024-01-01T00:15:00Z", value: 23.87 },
          ],
        },
      ],
    });
    props.result = {
      chartType: "single_value",
      series: props.series,
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      meta: { timezone: "UTC" },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    const unitNode = tree.findByProps({ className: "kpi-unit" });
    expect(valueNode.children.join(" ")).toBe("23.87");
    expect(unitNode.children.join(" ")).toBe("MINUTES");
    expect(valueNode.children.join(" ")).not.toContain("minutes");
  });

  it("formats percentage KPIs with a % suffix and uppercase label", () => {
    const props = buildProps({
      series: [
        {
          id: "primary",
          label: "Capacity usage",
          geometry: "metric",
          unit: "percentage",
          data: [{ x: "2024-01-01T00:15:00Z", value: 53 }],
        },
      ],
    });
    props.result = {
      chartType: "single_value",
      series: props.series,
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      meta: { timezone: "UTC" },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    const unitNode = tree.findByProps({ className: "kpi-unit" });
    expect(valueNode.children.join(" ")).toBe("53%");
    expect(unitNode.children.join(" ")).toBe("PERCENTAGE");
  });

  it("prefers an explicit headlineValue override for VRM KPIs", () => {
    const props = buildProps({
      series: [
        {
          id: "primary",
          label: "Entrances",
          geometry: "metric",
          unit: "events",
          data: [
            { x: "2024-01-01T00:00:00Z", value: 9 },
            { x: "2024-01-01T00:15:00Z", value: 18 },
          ],
        },
      ],
    });
    props.result = {
      chartType: "single_value",
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      series: props.series,
      meta: { timezone: "UTC", summary: { headlineValue: 4 } as any },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    const valueNode = tree.findByProps({ className: "kpi-value" });
    expect(valueNode.children.join(" ")).toBe("4");
  });

  it("suppresses unit labels and rounds dwell minutes for VRM tiles", () => {
    const props = buildProps({
      series: [
        {
          id: "primary",
          label: "Dwell",
          geometry: "metric",
          unit: "minutes",
          summary: { delta: -0.14 },
          data: [
            { x: "2024-01-01T00:00:00Z", value: 20 },
            { x: "2024-01-01T00:15:00Z", value: 23.87 },
          ],
        },
      ],
    });
    props.result = {
      chartType: "single_value",
      xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
      series: props.series,
      meta: { timezone: "UTC", summary: { presentation: "vrm" } as any },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    expect(tree.findAllByProps({ className: "kpi-unit" })).toHaveLength(0);
    const valueNode = tree.findByProps({ className: "kpi-value" });
    expect(valueNode.children.join(" ")).toBe("24 min");
    const headerRight = tree.findByProps({ className: "kpi-header-right" });
    const deltaNode = headerRight.findByProps({ className: "kpi-delta tone-negative" });
    expect(deltaNode.children.join(" ")).toContain("↓ 14%");
  });

  it("renders traffic distribution rows when chartStyle is traffic_distribution", () => {
    const props = buildProps({
      series: [
        {
          id: "traffic_share",
          label: "Traffic distribution",
          geometry: "bar",
          unit: "percentage",
          data: [
            { x: "Cam 0", value: 66.7 },
            { x: "Cam 1", value: 33.3 },
          ],
        },
      ],
    });
    props.result = {
      chartType: "categorical",
      series: props.series,
      xDimension: { id: "camera", type: "category" },
      meta: { timezone: "UTC", summary: { presentation: "vrm", chartStyle: "traffic_distribution" } as any },
    } as ChartResult;

    const tree = renderer.create(<KpiTile {...props} />).root;
    const rows = tree.findAllByProps({ className: "kpi-traffic-row" });
    expect(rows).toHaveLength(2);
    const labelText = rows[0].findByProps({ className: "kpi-traffic-label" }).children.join(" ");
    const valueText = rows[0]
      .findByProps({ className: "kpi-traffic-value" })
      .children.join("")
      .replace(/\s+/g, "");
    expect(labelText).toBe("Cam 0");
    expect(valueText).toBe("67%");
  });

  it("shows VRM popover from overlay hover without Recharts tooltip metadata", () => {
    const props = buildProps();
    props.result.meta = { timezone: "UTC", summary: { presentation: "vrm" } as any } as ChartResult["meta"];

    const tree = renderer.create(<KpiTile {...props} />);
    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");

    act(() => {
      overlay.props.onMouseMove({
        clientX: 0,
        currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 200 }) },
      });
    });

    const popover = tree.root.findByProps({ "aria-label": "VRM sparkline popover" });
    const valueNode = popover.findByProps({ className: "kpi-sparkline__popover-value" });
    const timeNode = popover.findByProps({ className: "kpi-sparkline__popover-time" });

    expect(valueNode.children.join(" ")).toBe("10");
    expect(timeNode.children.join(" ")).not.toBe("");
  });

  it("derives VRM hover index from overlay position", () => {
    const props = buildProps({
      series: [
        {
          id: "primary",
          label: "Primary",
          geometry: "metric",
          unit: "events",
          data: [
            { x: "2024-01-01T00:00:00Z", value: 1 },
            { x: "2024-01-01T00:15:00Z", value: 5 },
            { x: "2024-01-01T00:30:00Z", value: 10 },
            { x: "2024-01-01T00:45:00Z", value: 20 },
          ],
        },
      ],
    });
    props.result.meta = { timezone: "UTC", summary: { presentation: "vrm" } as any } as ChartResult["meta"];

    const tree = renderer.create(<KpiTile {...props} />);
    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");

    act(() => {
      overlay.props.onMouseMove({
        clientX: 200,
        currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 200 }) },
      });
    });

    const popover = tree.root.findByProps({ "aria-label": "VRM sparkline popover" });
    const valueNode = popover.findByProps({ className: "kpi-sparkline__popover-value" });

    expect(valueNode.children.join(" ")).toBe("20");
  });

  it("anchors VRM popover within the VRM tile", () => {
    const props = buildProps();
    props.result.meta = { timezone: "UTC", summary: { presentation: "vrm" } as any } as ChartResult["meta"];

    const tree = renderer.create(<KpiTile {...props} />);
    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");

    act(() => {
      overlay.props.onMouseMove({
        clientX: 10,
        currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
      });
    });

    const popover = tree.root.findByProps({ "aria-label": "VRM sparkline popover" });
    let cursor: any = popover.parent;
    let anchoredToTile = false;
    while (cursor) {
      if (cursor.props?.className?.includes?.("kpi-tile--vrm")) {
        anchoredToTile = true;
        break;
      }
      cursor = cursor.parent;
    }

    expect(anchoredToTile).toBe(true);
  });

  it("renders a VRM-only hover dot when hovering the sparkline overlay", () => {
    const props = buildProps();
    props.result.meta = { timezone: "UTC", summary: { presentation: "vrm" } as any } as ChartResult["meta"];

    const tree = renderer.create(<KpiTile {...props} />);
    const overlay = tree.root.find((node: any) => node.props["data-testid"] === "vrm-sparkline-overlay");

    expect(tree.root.findAll((node: any) => node.children?.includes?.("reference-dot"))).toHaveLength(0);

    act(() => {
      overlay.props.onMouseMove({
        clientX: 50,
        currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
      });
    });

    expect(tree.root.findAll((node: any) => node.children?.includes?.("reference-dot"))).toHaveLength(1);
  });
});
