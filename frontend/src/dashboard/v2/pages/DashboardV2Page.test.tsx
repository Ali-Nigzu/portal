/* eslint-disable testing-library/await-async-query */
import { jest } from "@jest/globals";
import renderer, { act } from "react-test-renderer";
import type { TestRenderer } from "react-test-renderer";
import type { ChartResult } from "../../../analytics/schemas/charting";
import type { DashboardManifest, DashboardWidget } from "../types";
import DashboardV2Page, { lookupCapacity } from "./DashboardV2Page";
import liveFlowResult from "../../../analytics/examples/golden_dashboard_live_flow.json";
import type { FetchDashboardManifestOptions } from "../transport/fetchDashboardManifest";
import type { LoadWidgetOptions } from "../transport/loadWidgetResult";
import { VRM_KPI_IDS, VRM_KPI_TITLES } from "../utils/applyVRMOverrides";
import { decorateResult, lastBucketValue } from "../utils/vrmDecorators";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const globalWithResizeObserver = global as typeof globalThis & {
  ResizeObserver: typeof ResizeObserverMock;
};

globalWithResizeObserver.ResizeObserver = ResizeObserverMock;

Object.defineProperty(global.HTMLElement.prototype, "getBoundingClientRect", {
  value: () => ({ width: 800, height: 400, top: 0, left: 0, bottom: 400, right: 800 }),
});

const renderedResults: ChartResult[] = [];

jest.mock("../../../analytics/components/ChartRenderer", () => ({
  ChartRenderer: ({ result }: { result: ChartResult }) => {
    renderedResults.push(result);
    return <div data-testid={`chart-${result.chartType}`}>{result.chartType}</div>;
  },
}));

const liveFlowChart = liveFlowResult as unknown as ChartResult;

type ManifestLoader = (
  orgId: string | undefined,
  dashboardId?: string,
  options?: FetchDashboardManifestOptions,
) => Promise<DashboardManifest>;
type WidgetResultLoader = (widget: DashboardWidget, options?: LoadWidgetOptions) => Promise<ChartResult>;
type UnpinMutator = (orgId: string, dashboardId: string, widgetId: string) => Promise<DashboardManifest>;

const baseWidgets: DashboardWidget[] = [
  {
    id: "kpi-activity",
    title: "Activity Today",
    kind: "kpi",
    chartSpecId: "dashboard.kpi.activity_today",
    fixtureId: "golden_dashboard_kpi_activity",
    locked: true,
    inlineSpec: undefined,
  },
  {
    id: "live-flow",
    title: "Live Flow",
    kind: "chart",
    chartSpecId: "dashboard.live_flow",
    fixtureId: "golden_dashboard_live_flow",
    locked: false,
  },
];

function cloneManifest(overrides?: Partial<DashboardManifest>): DashboardManifest {
  const manifest: DashboardManifest = {
    id: "dashboard-default",
    orgId: "client0",
    widgets: JSON.parse(JSON.stringify(baseWidgets)) as DashboardWidget[],
    layout: {
      kpiBand: ["kpi-activity"],
      grid: {
        columns: 12,
        placements: {
          "live-flow": { x: 0, y: 0, w: 12, h: 8 },
        },
      },
    },
    timeControls: {
      defaultTimeRangeId: "all_time",
      timezone: "UTC",
      options: [
        { id: "all_time", label: "All time", durationMinutes: null, bucket: "WEEK", allTime: true },
        { id: "last_24_hours", label: "Last 24 hours", durationMinutes: 24 * 60, bucket: "HOUR" },
        { id: "last_60_minutes", label: "Last 60 minutes", durationMinutes: 60, bucket: "5_MIN" },
      ],
    },
  };
  return { ...manifest, ...overrides };
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const buildSeriesPoints = (values: number[]) => {
  const now = Date.now();
  return values.map((value, index) => ({
    x: new Date(now - (values.length - index - 1) * FIFTEEN_MINUTES).toISOString(),
    y: value,
  }));
};

const buildChartResult = (
  values: number[],
  options?: {
    label?: string;
    unit?: string;
    meta?: ChartResult["meta"];
  },
): ChartResult => ({
  chartType: "single_value",
  xDimension: { id: "time", type: "time", bucket: "15_MIN", timezone: "UTC" },
  series: [
    {
      id: "primary",
      label: options?.label ?? "primary",
      geometry: "line",
      unit: options?.unit,
      data: buildSeriesPoints(values),
    },
  ],
  meta: options?.meta ?? { timezone: "UTC" },
});

const trafficDistributionResult: ChartResult = {
  chartType: "composed_time",
  xDimension: { id: "timestamp", type: "time", bucket: "15_MIN", timezone: "UTC" },
  series: [
    {
      id: "cam0",
      label: "Cam 0",
      geometry: "line",
      data: [
        { x: "2024-01-01T00:00:00Z", y: 10 },
        { x: "2024-01-01T00:15:00Z", y: 20 },
      ],
    },
    {
      id: "cam1",
      label: "Cam 1",
      geometry: "line",
      data: [
        { x: "2024-01-01T00:00:00Z", y: 5 },
        { x: "2024-01-01T00:15:00Z", y: 10 },
      ],
    },
  ],
  meta: { timezone: "UTC" },
};

afterEach(() => {
  renderedResults.length = 0;
});

async function flushEffects(times = 3) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("lookupCapacity", () => {
  it("returns configured capacity for known clients", () => {
    expect(lookupCapacity("client0")).toBe(10);
    expect(lookupCapacity("client1")).toBe(100);
    expect(lookupCapacity("client2")).toBe(100);
  });

  it("throws for unknown clients", () => {
    expect(() => lookupCapacity("unknown-client")).toThrow("Unknown client for capacity usage");
  });
});

describe("DashboardV2Page", () => {
  it("loads manifest and renders widgets", async () => {
    const manifestLoader = jest.fn<ReturnType<ManifestLoader>, Parameters<ManifestLoader>>(async () =>
      cloneManifest(),
    );
    const widgetLoader = jest.fn<ReturnType<WidgetResultLoader>, Parameters<WidgetResultLoader>>(async (
      widget: DashboardWidget,
    ) => {
      if (widget.id === VRM_KPI_IDS.traffic) {
        return trafficDistributionResult;
      }
      if (widget.kind === "kpi") {
        return buildChartResult([1, 2, 3]);
      }
      return liveFlowChart;
    });
    const unpin = jest.fn<ReturnType<UnpinMutator>, Parameters<UnpinMutator>>(async () => cloneManifest());

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
          unpinWidget={unpin}
        />,
      );
    });
    await flushEffects();

    expect(manifestLoader).toHaveBeenCalled();
    const [orgId, dashboardId, options] = manifestLoader.mock.calls[0]!;
    expect(orgId).toBe("client0");
    expect(dashboardId).toBe("dashboard-default");
    expect(options).toBeDefined();
    const widgetIds = widgetLoader.mock.calls.map(([widget]) => widget.id);
    const expectedIds = new Set([
      VRM_KPI_IDS.entrances,
      VRM_KPI_IDS.occupancy,
      VRM_KPI_IDS.exits,
      VRM_KPI_IDS.footfall,
      VRM_KPI_IDS.dwell,
      VRM_KPI_IDS.capacity,
      VRM_KPI_IDS.traffic,
      "live-flow",
    ]);
    expect(new Set(widgetIds)).toEqual(expectedIds);
    widgetLoader.mock.calls.forEach(([, opts]) => {
      expect(opts?.orgId).toBe("client0");
    });

    const removeButtons = tree!.root.findAllByProps({ className: "dashboard-v2__remove-button" });
    // Only the chart widget is removable by default.
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0].children.join(" ")).toContain("Unpin");
  });

  it("invokes unpin handler when clicking remove", async () => {
    const manifestLoader = jest.fn<ReturnType<ManifestLoader>, Parameters<ManifestLoader>>(async () => cloneManifest());
    const widgetLoader = jest.fn<ReturnType<WidgetResultLoader>, Parameters<WidgetResultLoader>>(async (
      widget: DashboardWidget,
    ) => {
      if (widget.id === VRM_KPI_IDS.traffic) {
        return trafficDistributionResult;
      }
      if (widget.kind === "kpi") {
        return buildChartResult([2, 4, 6]);
      }
      return liveFlowChart;
    });
    const unpin = jest.fn<ReturnType<UnpinMutator>, Parameters<UnpinMutator>>(async (
      _orgId: string,
      _dashboardId: string,
      widgetId: string,
    ) => {
      const next = cloneManifest();
      next.widgets = next.widgets.filter((widget) => widget.id !== widgetId);
      next.layout.kpiBand = next.layout.kpiBand.filter((id) => id !== widgetId);
      delete next.layout.grid.placements[widgetId];
      return next;
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
          unpinWidget={unpin}
        />,
      );
    });
    await flushEffects();

    const removeButton = tree!
      .root
      .findAllByProps({ className: "dashboard-v2__remove-button" })
      .at(0);
    expect(removeButton).toBeDefined();
    await act(async () => {
      removeButton?.props.onClick();
    });
    await flushEffects();

    expect(unpin).toHaveBeenCalledWith("client0", "dashboard-default", "live-flow");
  });

  it("passes view tokens to manifest and widget loaders", async () => {
    const manifestLoader = jest.fn<ReturnType<ManifestLoader>, Parameters<ManifestLoader>>(async () => cloneManifest());
    const widgetLoader = jest.fn<ReturnType<WidgetResultLoader>, Parameters<WidgetResultLoader>>(async (
      widget: DashboardWidget,
    ) => {
      if (widget.id === VRM_KPI_IDS.traffic) {
        return trafficDistributionResult;
      }
      if (widget.kind === "kpi") {
        return buildChartResult([3, 4, 5]);
      }
      return liveFlowChart;
    });

    const url = new URL(window.location.href);
    url.search = "?view_token=test-token";
    window.history.replaceState({}, "", url.toString());

    await act(async () => {
      renderer.create(
        <DashboardV2Page
          credentials={{ username: "admin", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    expect(manifestLoader).toHaveBeenCalled();
    const [orgId, , options] = manifestLoader.mock.calls[0]!;
    expect(orgId).toBeUndefined();
    expect(options?.viewToken).toBe("test-token");

    widgetLoader.mock.calls.forEach(([, opts]) => {
      expect(opts?.viewToken).toBe("test-token");
      expect(opts?.orgId).toBeUndefined();
    });

    window.history.replaceState({}, "", "/");
  });

  it("hides toolbar controls for VRM dashboards", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async (widget: DashboardWidget, options?: LoadWidgetOptions) => {
      if (widget.kind === "kpi") {
        return buildChartResult([5, 6, 7]);
      }
      return liveFlowChart;
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    expect(tree!.root.findAllByType("select")).toHaveLength(0);
    expect(tree!.root.findAllByProps({ className: "dashboard-v2__controls" })).toHaveLength(0);
    const refreshButtons = tree!.root.findAllByProps({ className: "dashboard-v2__button" });
    expect(refreshButtons).toHaveLength(0);
  });

  it("renders only the VRM KPI tiles in the band", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.id === VRM_KPI_IDS.traffic) {
        return trafficDistributionResult;
      }
      return buildChartResult([1, 2, 3]);
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    const kpiTiles = tree!.root.findAllByProps({ className: "dashboard-v2__kpi-content" });
    expect(kpiTiles).toHaveLength(Object.values(VRM_KPI_TITLES).length);
  });

  it("renders VRM header metadata", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async () => buildChartResult([1, 2, 3]));

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    const header = tree!.root.findByProps({ className: "dashboard-v2__meta-row" });
    const headerText = header.children
      .map((child: any) => {
        if (typeof child === "string") {
          return child;
        }
        if (Array.isArray(child?.props?.children)) {
          return child.props.children.join(" ");
        }
        return String(child?.props?.children ?? child);
      })
      .join(" ");
    expect(headerText).toContain("Last updated: Realtime");
    expect(headerText).toContain("Status: OK");
    expect(headerText).toContain("Local time:");
  });

  it("renders capacity usage subtitle without surfacing errors", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.kind === "kpi") {
        return buildChartResult([10, 15, 20], {
          meta: { timezone: "UTC", summary: { widgetId: widget.id } },
        });
      }
      return liveFlowChart;
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    const capacityResult = renderedResults.find((result) =>
      Boolean((result.meta?.summary as Record<string, unknown> | undefined)?.peak_capacity_usage_today),
    );
    expect(
      (capacityResult?.meta?.summary as Record<string, string> | undefined)?.vrmChipText ?? "",
    ).toContain("peak:");

    const errorTiles = tree!.root.findAllByProps({ className: "dashboard-v2__error" });
    expect(errorTiles.length).toBe(0);
  });

  it("surfaces widget errors in state", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.kind === "kpi") {
        if (widget.id === VRM_KPI_IDS.traffic) {
          return trafficDistributionResult;
        }
        return buildChartResult([1, 1, 1]);
      }
      throw new Error("fixture failure");
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    const errorBanner = tree!.root.findByProps({ className: "dashboard-v2__error-banner" });
    expect(errorBanner.children.join(" ")).toContain("Some widgets failed to load");
  });

  it("hides outer VRM captions while preserving summary metadata", async () => {
    renderedResults.length = 0;
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.kind === "kpi") {
        return buildChartResult([1, 2, 3], {
          meta: {
            timezone: "UTC",
            summary: { headline: `headline-${widget.id}`, secondaryText: `secondary-${widget.id}` },
          },
        });
      }
      return liveFlowChart;
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client1", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    expect(tree!.root.findAllByProps({ className: "dashboard-v2__kpi-subtitle" })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ className: "dashboard-v2__kpi-secondary" })).toHaveLength(0);

    const headlines = renderedResults.flatMap((result) =>
      Object.values(result.meta?.summary ?? {}).filter((value) => typeof value === "string" && value.startsWith("headline-")),
    );
    expect(headlines.length).toBeGreaterThan(0);
  });

  it("renders empty states when manifest has no widgets", async () => {
    const manifestLoader = jest.fn(async () =>
      cloneManifest({
        widgets: [],
        layout: { kpiBand: [], grid: { columns: 12, placements: {} } },
      }),
    );

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client0", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={jest.fn()}
        />,
      );
    });
    await flushEffects();

    const emptyMessages = tree!.root.findAllByProps({ className: "dashboard-v2__empty" });
    expect(emptyMessages).toHaveLength(1);
  });

  it("uses the org context for headers and capacity lookup", async () => {
    renderedResults.length = 0;
    const manifestLoader = jest.fn(async () => cloneManifest({ orgId: "client2" }));
    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.kind === "kpi") {
        const values = widget.id === VRM_KPI_IDS.capacity ? [50, 60] : [1, 2, 3];
        return buildChartResult(values, {
          label: widget.id,
          meta: { timezone: "UTC", summary: { widgetId: widget.id } },
        });
      }
      return liveFlowChart;
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client2", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    const title = tree!.root.findByProps({ className: "dashboard-v2__title" });
    expect(title.children.join(" ")).toContain("client2 – client2");

    const capacityResult = renderedResults.find(
      (result) => (result.meta?.summary as Record<string, string> | undefined)?.widgetId === VRM_KPI_IDS.capacity,
    );
    expect(lastBucketValue(capacityResult?.series?.[0])).toBeCloseTo(60);
  });

  it("prefers credential org over manifest org when decorating VRM results", async () => {
    renderedResults.length = 0;
    const manifestLoader = jest.fn(async () => cloneManifest({ orgId: "client1" }));
    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.kind === "kpi") {
        const values = widget.id === VRM_KPI_IDS.capacity ? [50, 100] : [1, 2, 3];
        return buildChartResult(values, {
          label: widget.id,
          meta: { timezone: "UTC", summary: { widgetId: widget.id } },
        });
      }
      return liveFlowChart;
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DashboardV2Page
          credentials={{ username: "client2", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    const title = tree!.root.findByProps({ className: "dashboard-v2__title" });
    expect(title.children.join(" ")).toContain("client2 – client2");

    const capacityResult = renderedResults.find(
      (result) => (result.meta?.summary as Record<string, string> | undefined)?.widgetId === VRM_KPI_IDS.capacity,
    );
    expect(capacityResult?.meta?.summary?.headlineValue).toBe(100);
  });

  it("derives VRM KPI headlines from the latest bucket values instead of 24h totals", () => {
    const buildWithTotals = (values: number[], widgetId: string) =>
      decorateResult(
        widgetId,
        buildChartResult(values, {
          meta: { timezone: "UTC", summary: { total: values.reduce((a, b) => a + b, 0) } },
        }),
        "client1",
      );

    const entrances = buildWithTotals([2, 5], VRM_KPI_IDS.entrances);
    const exits = buildWithTotals([3, 7], VRM_KPI_IDS.exits);
    const footfall = buildWithTotals([6, 9], VRM_KPI_IDS.footfall);
    const dwell = buildWithTotals([1.25, 3.5], VRM_KPI_IDS.dwell);
    const occupancy = buildWithTotals([45, 60], VRM_KPI_IDS.occupancy);
    const capacity = buildWithTotals([70, 90], VRM_KPI_IDS.capacity);

    expect(lastBucketValue(entrances.series[0])).toBe(5);
    expect(lastBucketValue(entrances.series[0])).not.toBe(7);

    expect(lastBucketValue(exits.series[0])).toBe(7);
    expect(lastBucketValue(exits.series[0])).not.toBe(10);

    expect(lastBucketValue(footfall.series[0])).toBe(9);
    expect(lastBucketValue(footfall.series[0])).not.toBe(15);

    expect(lastBucketValue(dwell.series[0])).toBeCloseTo(3.5);
    expect(lastBucketValue(dwell.series[0])).not.toBeCloseTo(4.75);

    expect(lastBucketValue(occupancy.series[0])).toBe(60);
    expect(lastBucketValue(occupancy.series[0])).not.toBe(105);

    expect(lastBucketValue(capacity.series[0])).toBe(90);
    expect(lastBucketValue(capacity.series[0])).not.toBe(160);
  });

  it("uses the latest 15-minute bucket for VRM KPI headlines", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const vrmSeries: Record<string, number[]> = {
      [VRM_KPI_IDS.entrances]: [2, 5],
      [VRM_KPI_IDS.exits]: [3, 8],
      [VRM_KPI_IDS.footfall]: [6, 9],
      [VRM_KPI_IDS.dwell]: [1.25, 3.5],
      [VRM_KPI_IDS.occupancy]: [45, 60],
      [VRM_KPI_IDS.capacity]: [70, 90],
    };

    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.id === VRM_KPI_IDS.traffic) {
        return trafficDistributionResult;
      }
      if (widget.kind === "kpi") {
        return buildChartResult(vrmSeries[widget.id] ?? [1], {
          label: widget.id,
          meta: { timezone: "UTC", summary: { widgetId: widget.id, total: 9999 } },
        });
      }
      return liveFlowChart;
    });

    await act(async () => {
      renderer.create(
        <DashboardV2Page
          credentials={{ username: "client1", password: "secret" }}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetLoader}
        />,
      );
    });
    await flushEffects();

    const resultsByWidgetId: Record<string, ChartResult> = {};
    renderedResults.forEach((result) => {
      const widgetId = (result.meta?.summary as Record<string, string> | undefined)?.widgetId;
      if (widgetId) {
        resultsByWidgetId[widgetId] = result;
      }
    });

    const getLastValue = (result?: ChartResult) => {
      const series = result?.series?.[0];
      if (!series || !series.data?.length) {
        return null;
      }
      const last = series.data[series.data.length - 1];
      return (last.value ?? last.y ?? null) as number | null;
    };

    expect(getLastValue(resultsByWidgetId[VRM_KPI_IDS.entrances])).toBe(5);
    expect(getLastValue(resultsByWidgetId[VRM_KPI_IDS.exits])).toBe(8);
    expect(getLastValue(resultsByWidgetId[VRM_KPI_IDS.footfall])).toBe(9);
    expect(getLastValue(resultsByWidgetId[VRM_KPI_IDS.dwell])).toBeCloseTo(3.5);
    expect(getLastValue(resultsByWidgetId[VRM_KPI_IDS.occupancy])).toBe(60);
    expect(getLastValue(resultsByWidgetId[VRM_KPI_IDS.capacity])).toBe(90);
  });
});

