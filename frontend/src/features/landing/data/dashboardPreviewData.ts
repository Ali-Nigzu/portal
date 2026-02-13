import type { DashboardManifest, DashboardWidgetState } from "../../dashboard/types";
import { applyVRMOverrides } from "../../dashboard/utils/applyVRMOverrides";
import { buildSnapshotWidgetResult } from "../../dashboard/utils/snapshotPayload";
import type { SnapshotResponse } from "../../../lib/snapshots";
import type { ChartWidgetsEntry } from "../../dashboard/components/DashboardView";
import type { SiteFlowDemographicsData } from "../../dashboard/utils/siteFlowDemographics";

const DEMO_SNAPSHOT: SnapshotResponse = {
  ts: "2026-01-15T12:00:00Z",
  mode: "snapshots",
  payload: [
    [12, 14, 16, 12, 13, 17, 19, 15, 11, 10],
    [34, 36, 40, 38, 37, 42, 44, 41, 39, 35],
    [8, 9, 11, 9, 10, 12, 13, 10, 8, 7],
    [20, 24, 27, 22, 21, 29, 32, 25, 19, 18],
    [5, 6, 7, 6, 5, 8, 9, 7, 6, 5],
    [62, 78],
    [41, 33, 26],
    [
      [[8, 10, 11, 13, 16, 14, 12, 10], [7, 8, 9, 11, 12, 11, 9, 8], [28, 30, 31, 34, 35, 33, 31, 29], [18, 20, 21, 24, 25, 23, 21, 20], [36, 38, 40, 43, 44, 42, 40, 37], [12, 18, 25, 22, 13, 10], [48, 46, 6], [39, 25, 31, 5]],
      [[8, 10, 11, 13, 16, 14, 12], [7, 8, 9, 11, 12, 11, 9], [28, 30, 31, 34, 35, 33, 31], [18, 20, 21, 24, 25, 23, 21], [36, 38, 40, 43, 44, 42, 40], [12, 18, 25, 22, 13, 10], [48, 46, 6], [39, 25, 31, 5]],
      [[8, 10, 11, 13, 16, 14], [7, 8, 9, 11, 12, 11], [28, 30, 31, 34, 35, 33], [18, 20, 21, 24, 25, 23], [36, 38, 40, 43, 44, 42], [12, 18, 25, 22, 13, 10], [48, 46, 6], [39, 25, 31, 5]],
      [[8, 10, 11, 13, 16], [7, 8, 9, 11, 12], [28, 30, 31, 34, 35], [18, 20, 21, 24, 25], [36, 38, 40, 43, 44], [12, 18, 25, 22, 13, 10], [48, 46, 6], [39, 25, 31, 5]],
      [[8, 10, 11, 13], [7, 8, 9, 11], [28, 30, 31, 34], [18, 20, 21, 24], [36, 38, 40, 43], [12, 18, 25, 22, 13, 10], [48, 46, 6], [39, 25, 31, 5]],
      [[8, 10, 11], [7, 8, 9], [28, 30, 31], [18, 20, 21], [36, 38, 40], [12, 18, 25, 22, 13, 10], [48, 46, 6], [39, 25, 31, 5]],
      [[8, 10], [7, 8], [28, 30], [18, 20], [36, 38], [12, 18, 25, 22, 13, 10], [48, 46, 6], [39, 25, 31, 5]],
    ],
  ],
};

const PREVIEW_BASE_MANIFEST: DashboardManifest = {
  id: "dashboard-preview",
  orgId: "demo",
  widgets: [
    {
      id: "live-flow",
      title: "Site Flow",
      kind: "chart",
      chartSpecId: "dashboard.live_flow",
      locked: true,
    },
  ],
  layout: {
    kpiBand: [],
    grid: {
      columns: 12,
      placements: {
        "live-flow": { x: 0, y: 0, w: 12, h: 4 },
      },
    },
  },
  timeControls: {
    defaultTimeRangeId: "today",
    timezone: "UTC",
    options: [
      { id: "today", label: "Today", durationMinutes: 1440, bucket: "15_MIN" },
    ],
  },
};

const PREVIEW_DEMOGRAPHICS: SiteFlowDemographicsData = {
  timezone: "UTC",
  age: [
    { code: 0, label: "0–4", count: 9 },
    { code: 1, label: "5–13", count: 16 },
    { code: 2, label: "14–25", count: 24 },
    { code: 3, label: "26–45", count: 28 },
    { code: 4, label: "46–65", count: 17 },
    { code: 5, label: "66+", count: 6 },
  ],
  gender: [
    { code: 0, label: "Male", count: 48 },
    { code: 1, label: "Female", count: 46 },
    { code: 2, label: "Unknown", count: 6 },
  ],
  race: [
    { code: 0, label: "Light", count: 39 },
    { code: 1, label: "Mix", count: 25 },
    { code: 2, label: "Dark", count: 31 },
    { code: 3, label: "Unknown", count: 5 },
  ],
};

export interface DashboardPreviewModel {
  manifest: DashboardManifest;
  kpiWidgets: DashboardWidgetState[];
  chartWidgets: ChartWidgetsEntry[];
  gridColumns: number;
  siteFlowActivity: {
    status: "ready";
    result: ReturnType<typeof buildSnapshotWidgetResult>;
  };
  siteFlowDemographics: {
    status: "ready";
    data: SiteFlowDemographicsData;
  };
}

export const createDashboardPreviewModel = (): DashboardPreviewModel => {
  const manifest = applyVRMOverrides(PREVIEW_BASE_MANIFEST);
  const widgetState = new Map<string, DashboardWidgetState>();

  manifest.widgets.forEach((widget) => {
    let result;
    try {
      result = buildSnapshotWidgetResult(widget.id, DEMO_SNAPSHOT, "today");
      widgetState.set(widget.id, { widget, status: "ready", result });
    } catch {
      widgetState.set(widget.id, { widget, status: "error", error: "Preview temporarily unavailable" });
    }
  });

  const kpiWidgets = manifest.layout.kpiBand
    .map((widgetId) => widgetState.get(widgetId))
    .filter((entry): entry is DashboardWidgetState => Boolean(entry));

  const kpiSet = new Set(manifest.layout.kpiBand);
  const chartWidgets: ChartWidgetsEntry[] = manifest.widgets
    .filter((widget) => !kpiSet.has(widget.id))
    .map((widget) => ({
      state: widgetState.get(widget.id) ?? { widget, status: "idle" },
      placement: manifest.layout.grid.placements[widget.id],
    }));

  const siteFlowResult = buildSnapshotWidgetResult("live-flow", DEMO_SNAPSHOT, "today");

  return {
    manifest,
    kpiWidgets,
    chartWidgets,
    gridColumns: manifest.layout.grid.columns,
    siteFlowActivity: {
      status: "ready",
      result: siteFlowResult,
    },
    siteFlowDemographics: {
      status: "ready",
      data: PREVIEW_DEMOGRAPHICS,
    },
  };
};
