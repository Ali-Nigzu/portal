import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ChartResult } from "../../../analytics/schemas/charting";
import DashboardV2Page from "../pages/DashboardV2Page";
import type { DashboardManifest, DashboardWidget } from "../types";
import manifestFixture from "../examples/dashboard_manifest_default.json";
import activityResult from "../../../analytics/examples/golden_dashboard_kpi_activity.json";
import entrancesResult from "../../../analytics/examples/golden_dashboard_kpi_entrances.json";
import exitsResult from "../../../analytics/examples/golden_dashboard_kpi_exits.json";
import dwellResult from "../../../analytics/examples/golden_dashboard_kpi_avg_dwell.json";
import occupancyResult from "../../../analytics/examples/golden_dashboard_kpi_live_occupancy.json";
import freshnessResult from "../../../analytics/examples/golden_dashboard_kpi_freshness.json";
import liveFlowResult from "../../../analytics/examples/golden_dashboard_live_flow.json";
import { Credentials } from "../../../types/credentials";

const fixtureManifest = manifestFixture as DashboardManifest;

const fixtureResults: Record<string, ChartResult> = {
  golden_dashboard_kpi_activity: activityResult as unknown as ChartResult,
  golden_dashboard_kpi_entrances: entrancesResult as unknown as ChartResult,
  golden_dashboard_kpi_exits: exitsResult as unknown as ChartResult,
  golden_dashboard_kpi_avg_dwell: dwellResult as unknown as ChartResult,
  golden_dashboard_kpi_live_occupancy: occupancyResult as unknown as ChartResult,
  golden_dashboard_kpi_freshness: freshnessResult as unknown as ChartResult,
  golden_dashboard_live_flow: liveFlowResult as unknown as ChartResult,
};

interface DashboardStoryArgs {
  credentials: Credentials;
  initialManifest: DashboardManifest;
  resultOverrides?: Partial<Record<string, ChartResult>>;
  failingWidgets?: string[];
  enablePinningControls?: boolean;
}

function cloneManifest(manifest: DashboardManifest): DashboardManifest {
  return JSON.parse(JSON.stringify(manifest)) as DashboardManifest;
}

function cloneChartResult(result: ChartResult): ChartResult {
  return JSON.parse(JSON.stringify(result)) as ChartResult;
}

const DashboardStoryHarness = ({
  credentials,
  initialManifest,
  resultOverrides,
  failingWidgets,
  enablePinningControls,
}: DashboardStoryArgs) => {
  const [manifest, setManifest] = useState<DashboardManifest>(() => cloneManifest(initialManifest));
  const idCounter = useRef(0);

  const manifestLoader = useCallback(async () => cloneManifest(manifest), [manifest]);

  const overrideMap = useMemo(() => {
    const map: Record<string, ChartResult> = {};
    Object.entries(resultOverrides ?? {}).forEach(([widgetId, result]) => {
      if (result) {
        map[widgetId] = result;
      }
    });
    return map;
  }, [resultOverrides]);

  const widgetResultLoader = useCallback(
    async (widget: DashboardWidget) => {
      if (failingWidgets?.includes(widget.id)) {
        throw new Error("Widget failed to load");
      }
      if (overrideMap[widget.id]) {
        return cloneChartResult(overrideMap[widget.id]);
      }
      const fixtureId = widget.fixtureId ?? "golden_dashboard_kpi_activity";
      const fixture = fixtureResults[fixtureId] ?? fixtureResults.golden_dashboard_kpi_activity;
      return cloneChartResult(fixture);
    },
    [failingWidgets, overrideMap],
  );

  const unpinWidget = useCallback(
    async (_orgId: string, _dashboardId: string, widgetId: string) => {
      const next = cloneManifest(manifest);
      next.widgets = next.widgets.filter((widget) => widget.id !== widgetId);
      next.layout.kpiBand = next.layout.kpiBand.filter((id) => id !== widgetId);
      if (next.layout.grid.placements[widgetId]) {
        delete next.layout.grid.placements[widgetId];
      }
      setManifest(next);
      return cloneManifest(next);
    },
    [manifest],
  );

  const handlePinSample = useCallback(() => {
    setManifest((current) => {
      const next = cloneManifest(current);
      const newId = `pinned-${idCounter.current + 1}`;
      idCounter.current += 1;
      const newWidget: DashboardWidget = {
        id: newId,
        title: `Pinned Chart ${idCounter.current}`,
        kind: "chart",
        chartSpecId: "dashboard.live_flow",
        fixtureId: "golden_dashboard_live_flow",
        locked: false,
        layout: { grid: { w: 6, h: 6 } },
      };
      next.widgets.push(newWidget);
      const placements = next.layout.grid.placements;
      const bottom = Object.values(placements)
        .map((placement) => placement.y + placement.h)
        .reduce((max, value) => Math.max(max, value), 0);
      placements[newId] = { x: 0, y: bottom, w: 6, h: 6 };
      return next;
    });
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {enablePinningControls ? (
        <div style={{ padding: "16px", display: "flex", gap: "8px" }}>
          <button type="button" onClick={handlePinSample}>
            Pin sample chart
          </button>
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DashboardV2Page
          credentials={credentials}
          manifestLoader={manifestLoader}
          widgetResultLoader={widgetResultLoader}
          unpinWidget={unpinWidget}
        />
      </div>
    </div>
  );
};

const meta: Meta<DashboardStoryArgs> = {
  title: "Dashboard/DashboardV2Page",
  component: DashboardV2Page,
  parameters: { layout: "fullscreen" },
  args: {
    credentials: { username: "client0", password: "storybook" },
    initialManifest: fixtureManifest,
  },
  render: (args) => <DashboardStoryHarness {...args} />,
  argTypes: {
    initialManifest: { control: false },
    resultOverrides: { control: false },
    failingWidgets: { control: false },
    enablePinningControls: { control: false },
  },
};

export default meta;

type Story = StoryObj<DashboardStoryArgs>;

export const Default: Story = {};

export const LowCoverageKpis: Story = {
  name: "KPI row with low coverage",
};

const baseFlowFixture = cloneChartResult(fixtureResults.golden_dashboard_live_flow);
const missingSeriesFlow: ChartResult = {
  ...baseFlowFixture,
  series: baseFlowFixture.series.slice(0, 1),
};

export const LiveFlowMissingSeries: Story = {
  name: "Live Flow with missing series",
  args: {
    resultOverrides: {
      "live-flow": missingSeriesFlow,
    },
  },
};

export const TimeRangeInteractions: Story = {
  name: "Time-range switching",
};

export const PinAndUnpinSequence: Story = {
  name: "Pin / unpin sequence",
  args: {
    enablePinningControls: true,
  },
};

export const EmptyManifestState: Story = {
  name: "Empty manifest",
  args: {
    initialManifest: {
      ...cloneManifest(fixtureManifest),
      widgets: [],
      layout: { kpiBand: [], grid: { columns: 12, placements: {} } },
    },
  },
};

export const ErrorBoundaryState: Story = {
  name: "Widget error boundary",
  args: {
    failingWidgets: ["live-flow"],
  },
};
