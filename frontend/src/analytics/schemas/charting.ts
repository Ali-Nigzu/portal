import type { AxisConfig } from "../components/ChartRenderer/managers/AxisManager";
export type SeriesVisibilityMap = Record<string, boolean>;

type ChartType = "composed_time" | "categorical" | "single_value";
type AxisBinding = "Y1" | "Y2" | "Y3";
type Geometry = "line" | "area" | "column" | "bar";
interface Annotation {
  x: string;
  text: string;
  severity?: "info" | "warning" | "critical";
}
interface SeriesSummary {
  [key: string]: number | string | null | undefined;
}
interface DataPoint {
  x: string;
  label?: string;
  y?: number | null;
  value?: number | null;
  group?: string;
  coverage?: number | null;
  rawCount?: number | null;
  comparison?: number | null;
  target?: number | null;
}
export interface ChartSeries {
  id: string;
  label?: string;
  axis?: AxisBinding;
  unit?: string;
  seriesGroup?: string;
  noDots?: boolean;
  geometry: Geometry;
  stack?: string;
  color?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  hideInLegend?: boolean;
  hideInTooltip?: boolean;
  tooltipValueKey?: string;
  data: DataPoint[];
  summary?: SeriesSummary;
  annotations?: Annotation[];
}
type DimensionType = "time" | "category";
interface DimensionDescriptor {
  id: string;
  type: DimensionType;
  bucket?: string;
  timezone?: string;
  label?: string;
}
interface CoveragePoint {
  x: string;
  value: number | null;
}
interface SurgePoint {
  x: string;
  reason: string;
  measure?: string;
}
interface ResultMeta {
  bucketMinutes?: number;
  timezone: string;
  coverage?: CoveragePoint[];
  surges?: SurgePoint[];
  summary?: Record<string, number | string | null>;
  notes?: string[];
}
export interface ChartResult {
  chartType: ChartType;
  xDimension: DimensionDescriptor;
  series: ChartSeries[];
  meta: ResultMeta;
}

export const SITE_FLOW_ACTIVITY_COLORS: Readonly<Record<string, string>> = {
  entrances: "#47c96f",
  exits: "#ff5964",
  occupancy: "#2685ff",
} as const;

export interface ChartPrimitiveProps {
  result: ChartResult;
  series: ChartSeries[];
  axisConfig: AxisConfig;
  visibility: SeriesVisibilityMap;
  onToggleSeries?: (seriesId: string) => void;
  height: number;
  className?: string;
  widgetId?: string;
  useRawLabels?: boolean;
  labelKey?: string;
  showBrush?: boolean;
  tooltipVariant?: "site_flow_activity";
  siteFlowTimeframe?: string;
  hideInactiveLegend?: boolean;
  siteFlowActivity?: boolean;
  donutTooltipMode?: "standard" | "demo_cursor_hover";
  donutTooltipOwnerId?: string;
}
