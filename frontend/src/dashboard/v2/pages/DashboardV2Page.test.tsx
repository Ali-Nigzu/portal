/* eslint-disable testing-library/await-async-query */
import { jest } from "@jest/globals";
import renderer, { act } from "react-test-renderer";
import type { TestRenderer } from "react-test-renderer";
import type { ChartResult } from "../../../analytics/schemas/charting";
import type { DashboardManifest, DashboardWidget } from "../types";
import DashboardV2Page from "./DashboardV2Page";
import activityResult from "../../../analytics/examples/golden_dashboard_kpi_activity.json";
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

jest.mock("../../../analytics/components/ChartRenderer", () => ({
  ChartRenderer: ({ result }: { result: ChartResult }) => (
    <div data-testid={`chart-${result.chartType}`}>{result.chartType}</div>
  ),
}));

const activityChart = activityResult as unknown as ChartResult;
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
    inlineSpec: (activityResult as unknown as { id: string }).id
      ? (activityResult as unknown as { id: string })
      : undefined,
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

const buildChartResult = (values: number[]): ChartResult => ({
  chartType: "single_value",
  series: [
    {
      id: "primary",
      label: "primary",
      data: buildSeriesPoints(values),
    },
  ],
  meta: { timezone: "UTC" },
});

const trafficDistributionResult: ChartResult = {
  chartType: "categorical",
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

async function flushEffects(times = 3) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

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
    const expectedIds = new Set([...Object.values(VRM_KPI_IDS), "live-flow"]);
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

    const widgetIds = widgetLoader.mock.calls.map(([widget]) => widget.id);
    Object.values(VRM_KPI_IDS).forEach((id) => expect(widgetIds).toContain(id));
    widgetLoader.mock.calls
      .filter(([widget]) => Object.values(VRM_KPI_IDS).includes(widget.id))
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
      .map((node) => node.children.join(" "));

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
});
