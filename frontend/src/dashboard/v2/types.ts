import type { ChartResult, ChartSpec, TimeBucket } from "../../analytics/schemas/charting";

export type DashboardWidgetKind = "kpi" | "chart";

export interface DashboardWidget {
  id: string;
  title: string;
  subtitle?: string;
  kind: DashboardWidgetKind;
  chartSpecId?: string;
  fixtureId?: string;
  inlineSpec?: ChartSpec;
  layout?: DashboardWidgetLayout;
  locked?: boolean;
}

export interface DashboardGridPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  kpiBand: string[];
  grid: {
    columns: number;
    placements: Record<string, DashboardGridPlacement>;
  };
}

export interface DashboardWidgetLayout {
  grid?: Partial<DashboardGridPlacement>;
}

export interface DashboardTimeRangeOption {
  id: string;
  label: string;
  durationMinutes: number;
  bucket?: TimeBucket;
}

export interface DashboardTimeControls {
  defaultTimeRangeId: string;
  timezone: string;
  options: DashboardTimeRangeOption[];
}

export interface DashboardManifest {
  id: string;
  orgId: string;
  widgets: DashboardWidget[];
  layout: DashboardLayout;
  timeControls?: DashboardTimeControls;
}

export interface DashboardWidgetState {
  widget: DashboardWidget;
  result?: ChartResult;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
}
