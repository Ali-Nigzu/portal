import React from "react";
import renderer from "react-test-renderer";

import type { ChartPrimitiveProps } from "../types";
import type { ChartResult } from "../../../schemas/charting";
import { KpiTile } from "../KpiTile";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  Tooltip: () => <div data-testid="tooltip" />,
  YAxis: () => <div data-testid="y-axis" />,
  XAxis: () => <div data-testid="x-axis" />,
  ReferenceDot: () => <div data-testid="reference-dot" />,
}));

let consoleErrorSpy: jest.SpyInstance;
let rectSpy: jest.SpyInstance;

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

  class ResizeObserverMock {
    observe() {
      // no-op
    }
    unobserve() {
      // no-op
    }
    disconnect() {
      // no-op
    }
  }
  // @ts-expect-error jsdom test environment does not ship ResizeObserver
  global.ResizeObserver = ResizeObserverMock;

  rectSpy = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 200,
    height: 80,
    top: 0,
    left: 0,
    bottom: 80,
    right: 200,
    x: 0,
    y: 0,
    toJSON() {
      return "";
    },
  });
});

afterAll(() => {
  rectSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

const mockResult: ChartResult = {
  chartType: "single_value",
  xDimension: { id: "timestamp", type: "time", bucket: "MINUTE", timezone: "UTC" },
  series: [
    {
      id: "occupancy",
      label: "Occupancy",
      geometry: "line",
      unit: "people",
      data: [
        { x: "2024-01-01T00:00:00Z", value: 100 },
        { x: "2024-01-01T00:05:00Z", value: 120 },
        { x: "2024-01-01T00:10:00Z", value: 90 },
      ],
      summary: { delta: -0.01 },
      color: "#2d6cdf",
    },
  ],
  meta: {
    timezone: "UTC",
    summary: {
      presentation: "vrm",
      title: "Occupancy",
    } as Record<string, unknown>,
  },
};

const defaultProps: Omit<ChartPrimitiveProps, "series" | "result"> = {
  axisConfig: {} as any,
  visibility: {},
  height: 200,
};

describe("KpiTile VRM hover footer", () => {
  it("renders hover footer below sparkline and toggles with hover state", () => {
    const tree = renderer.create(<KpiTile {...defaultProps} result={mockResult} series={mockResult.series} />);
    const root = tree.root;

    expect(() => root.findByProps({ "data-testid": "vrm-sparkline-footer" })).toThrow();

    const overlay = root.findByProps({ "data-testid": "vrm-sparkline-overlay" });
    renderer.act(() => {
      overlay.props.onMouseEnter?.({
        clientX: 100,
        clientY: 0,
        currentTarget: {
          getBoundingClientRect: () => overlay.props.getBoundingClientRect?.() ?? {
            width: 200,
            left: 0,
          },
        },
      });
    });

    const footer = root.findByProps({ "data-testid": "vrm-sparkline-footer" });
    const region = root.findByProps({ "data-testid": "vrm-sparkline-region" });
    const shell = root.findByProps({ "data-testid": "vrm-sparkline-shell" });

    expect(region.children[0]).toBe(shell);
    expect(shell.children).not.toContain(footer);
    expect(region.children[region.children.length - 1]).toBe(footer);

    renderer.act(() => {
      region.props.onMouseLeave?.();
    });

    expect(() => root.findByProps({ "data-testid": "vrm-sparkline-footer" })).toThrow();
  });
});
