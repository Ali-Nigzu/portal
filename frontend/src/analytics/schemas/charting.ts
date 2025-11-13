/**
 * Canonical analytics contracts shared between the backend compiler and the
 * frontend renderer. The shapes mirror the JSON Schemas defined in
 * `shared/analytics/schemas` and the specification outlined in
 * `ANALYTICS_DEVELOPMENT_PLAN.md` Phase 1.
 */

export type ChartDatasetId = "events";

export type MeasureAggregation =
  | "occupancy_recursion"
  | "count"
  | "activity_rate"
  | "dwell_mean"
  | "dwell_p90"
  | "sessions"
  | "demographic_count"
  | "retention_rate";

export type EventType = 0 | 1;

export interface ChartMeasure {
  id: string;
  label?: string;
  aggregation: MeasureAggregation;
  eventTypes?: EventType[];
  options?: Record<string, unknown>;
}

export type TimeBucket =
  | "RAW"
  | "5_MIN"
  | "15_MIN"
  | "30_MIN"
  | "HOUR"
  | "DAY"
  | "WEEK"
  | "MONTH";

export interface ChartDimension {
  id: string;
  column: string;
  bucket?: TimeBucket;
  sort?: "asc" | "desc";
}

export interface ChartSplit {
  id: string;
  column: string;
  limit?: number;
  sort?: "asc" | "desc";
}

export type FilterComparisonOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "between"
  | "gte"
  | "lte"
  | "gt"
  | "lt"
  | "contains"
  | "starts_with"
  | "ends_with";

export interface FilterCondition {
  field: string;
  op: FilterComparisonOperator;
  value?: string | number | boolean | Array<string | number>;
}

export interface FilterGroup {
  logic: "AND" | "OR";
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface TimeWindow {
  from: string;
  to: string;
  bucket?: TimeBucket;
  timezone?: string;
  compareTo?: string;
}

export type ComparisonMode =
  | "none"
  | "previous_period"
  | "year_over_year"
  | "custom";

export interface ComparisonConfig {
  mode: ComparisonMode;
  periodOffset?: string;
}

export interface InteractionConfig {
  zoom?: boolean;
  hoverSync?: boolean;
  seriesToggle?: boolean;
  export?: Array<"png" | "csv" | "xlsx">;
}

export type StackMode = "none" | "normalized" | "absolute";

export interface DisplayHints {
  carryForward?: boolean;
  stack?: StackMode;
  y1Label?: string;
  y2Label?: string;
}

export type ChartType =
  | "composed_time"
  | "categorical"
  | "heatmap"
  | "retention"
  | "single_value";

export interface ChartSpec {
  id: string;
  dataset: ChartDatasetId;
  version?: string;
  measures: ChartMeasure[];
  dimensions: ChartDimension[];
  splits?: ChartSplit[];
  filters?: FilterGroup[];
  timeWindow: TimeWindow;
  comparison?: ComparisonConfig;
  interactions?: InteractionConfig;
  displayHints?: DisplayHints;
  chartType: ChartType;
  description?: string;
  notes?: string[];
}

export type AxisBinding = "Y1" | "Y2" | "Y3";

export type Geometry =
  | "line"
  | "area"
  | "column"
  | "bar"
  | "heatmap"
  | "scatter"
  | "metric";

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
  y?: number | null;
  value?: number | null;
  group?: string;
  coverage?: number | null;
  comparison?: number | null;
  target?: number | null;
}

export interface ChartSeries {
  id: string;
  label?: string;
  axis?: AxisBinding;
  unit?: string;
  geometry: Geometry;
  stack?: string;
  color?: string;
  data: DataPoint[];
  summary?: SeriesSummary;
  annotations?: Annotation[];
}

export type DimensionType = "time" | "category" | "matrix" | "index";

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

export const CHART_SPEC_SCHEMA_ID =
  "https://line-analytics/schemas/chart-spec.schema.json" as const;
export const CHART_RESULT_SCHEMA_ID =
  "https://line-analytics/schemas/chart-result.schema.json" as const;

