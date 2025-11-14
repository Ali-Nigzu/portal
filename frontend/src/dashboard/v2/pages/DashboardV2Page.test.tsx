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
  orgId: string,
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
      defaultTimeRangeId: "last_24_hours",
      timezone: "UTC",
      options: [
        { id: "last_24_hours", label: "Last 24 hours", durationMinutes: 24 * 60, bucket: "HOUR" },
        { id: "last_60_minutes", label: "Last 60 minutes", durationMinutes: 60, bucket: "5_MIN" },
      ],
    },
  };
  return { ...manifest, ...overrides };
}

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
    const manifestLoader = jest.fn<ReturnType<ManifestLoader>, Parameters<ManifestLoader>>(async () => cloneManifest());
    const widgetLoader = jest.fn<ReturnType<WidgetResultLoader>, Parameters<WidgetResultLoader>>(async (
      widget: DashboardWidget,
    ) => (widget.kind === "kpi" ? activityChart : liveFlowChart));
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
    expect(new Set(widgetIds)).toEqual(new Set(["kpi-activity", "live-flow"]));

    const removeButtons = tree!.root.findAllByProps({ className: "dashboard-v2__remove-button" });
    // Only the chart widget is removable by default.
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0].children.join(" ")).toContain("Unpin");
  });

  it("invokes unpin handler when clicking remove", async () => {
    const manifestLoader = jest.fn<ReturnType<ManifestLoader>, Parameters<ManifestLoader>>(async () => cloneManifest());
    const widgetLoader = jest.fn<ReturnType<WidgetResultLoader>, Parameters<WidgetResultLoader>>(async (
      widget: DashboardWidget,
    ) => (widget.kind === "kpi" ? activityChart : liveFlowChart));
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

  it("re-runs widget loader when time range changes", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async (widget: DashboardWidget, options?: LoadWidgetOptions) => {
      if (widget.kind === "kpi") {
        return activityChart;
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
  });

  it("surfaces widget errors in state", async () => {
    const manifestLoader = jest.fn(async () => cloneManifest());
    const widgetLoader = jest.fn(async (widget: DashboardWidget) => {
      if (widget.kind === "kpi") {
        return activityChart;
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
    expect(emptyMessages).toHaveLength(2);
  });
});
