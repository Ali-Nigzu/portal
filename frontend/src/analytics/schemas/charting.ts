export type ChartType = "composed_time" | "categorical" | "single_value";
export type AxisBinding = "Y1" | "Y2" | "Y3";
export type Geometry = "line" | "area" | "column" | "bar";
export interface Annotation {
  x: string;
  text: string;
  severity?: "info" | "warning" | "critical";
}
export interface SeriesSummary {
  [key: string]: number | string | null | undefined;
}
export interface DataPoint {
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
export type DimensionType = "time" | "category";
export interface DimensionDescriptor {
  id: string;
  type: DimensionType;
  bucket?: string;
  timezone?: string;
  label?: string;
}
export interface CoveragePoint {
  x: string;
  value: number | null;
}
export interface SurgePoint {
  x: string;
  reason: string;
  measure?: string;
}
export interface ResultMeta {
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

export const SITE_FLOW_ACTIVITY_COLORS = {
  entrances: "#47c96f",
  exits: "#ff5964",
  occupancy: "#2685ff",
} as const;
