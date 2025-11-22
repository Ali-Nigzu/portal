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
  chartType: "categorical",
  xDimension: { id: "camera_id", type: "category" },
  series: [
    {
      id: "events",
      label: "Events",
      geometry: "bar",
      data: [
        { x: "Camera 1", y: 100 },
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
    expect(lookupCapacity("client1")).toBe(10);
    expect(lookupCapacity("client2")).toBe(100);
  });

  it("falls back to 10 and logs a warning for unknown clients", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(lookupCapacity("unknown-client")).toBe(10);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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
      "live-flow",
    ]);
    expect(new Set(widgetIds)).toEqual(expectedIds);
    expect(widgetIds).not.toContain(VRM_KPI_IDS.traffic);
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

  it("re-runs widget loader when time range changes", async () => {
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

    widgetLoader.mockClear();

    const select = tree!.root.findByType("select");
    await act(async () => {
      select.props.onChange({ target: { value: "last_60_minutes" } });
    });
    await flushEffects();

    expect(widgetLoader).toHaveBeenCalled();
    const callArgs = widgetLoader.mock.calls[0][1];
    expect(callArgs?.timeRange?.id).toBe("last_60_minutes");
    expect(callArgs?.orgId).toBe("client0");

    const vrmIds = (
      Object.values(VRM_KPI_IDS).filter((id) => id !== VRM_KPI_IDS.traffic) as DashboardWidget["id"][]
    );
    const widgetIds = widgetLoader.mock.calls.map(([widget]) => widget.id);
    vrmIds.forEach((id) => expect(widgetIds).toContain(id));
    widgetLoader.mock.calls
      .filter(([widget]) => vrmIds.includes(widget.id))
      .forEach(([widget]) => {
        expect(widget.fixedTimeWindow).toEqual({ bucket: "15_MIN", durationMinutes: 1440 });
      });
  });

  it("renders VRM KPI titles and hides legacy ones", async () => {
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

    const titles = tree!
      .root
      .findAllByProps({ className: "dashboard-v2__kpi-title" })
      .map((node: { children: (string | number)[] }) => node.children.join(" "));

    Object.values(VRM_KPI_TITLES).forEach((label) => expect(titles).toContain(label));
    expect(titles).not.toContain("Activity Today");
    expect(titles).not.toContain("Freshness Status");
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
        return buildChartResult([10, 15, 20]);
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

    const subtitles = tree!
      .root
      .findAllByProps({ className: "dashboard-v2__kpi-secondary" })
      .map((node: { children: (string | number)[] }) => node.children.join(" "));
    expect(subtitles.some((text: string) => text.includes("Peak today:"))).toBe(true);

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

  it("uses the latest 15-minute bucket for VRM KPI headlines", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const vrmSeries: Record<string, number[]> = {
      [VRM_KPI_IDS.entrances]: [2, 5],
      [VRM_KPI_IDS.exits]: [3, 8],
      [VRM_KPI_IDS.footfall]: [6, 9],
      [VRM_KPI_IDS.dwell]: [1.25, 3.5],
      [VRM_KPI_IDS.occupancy]: [45, 60],
      [VRM_KPI_IDS.capacity]: [7, 9],
    };

    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.id === VRM_KPI_IDS.traffic) {
        return trafficDistributionResult;
      }
      if (widget.kind === "kpi") {
        return buildChartResult(vrmSeries[widget.id] ?? [1], {
          label: widget.id,
          meta: { timezone: "UTC", summary: { widgetId: widget.id } },
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

