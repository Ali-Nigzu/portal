import { CardControlState } from '../hooks/useCardControls';
import { computeChartSeries, NormalizedChartPoint } from '../hooks/useChartData';
import { IntelligencePayload } from '../types/analytics';
import { ChartData, getAgeBand } from './dataProcessing';
import {
  filterDataByControls,
  getDateRangeFromPreset,
  deriveComparisonRange,
  DateRange,
} from './rangeUtils';
import { GranularityOption } from '../styles/designTokens';

export type AnalyticsDatasetOption = 'events' | 'dwell' | 'occupancy';
export type AnalyticsXAxisOption = 'time_bucket' | 'weekday' | 'camera' | 'site';
export type AnalyticsMetricOption =
  | 'occupancy'
  | 'entrances'
  | 'exits'
  | 'activity'
  | 'throughput'
  | 'avg_dwell'
  | 'p90_dwell'
  | 'unique_tracks';
export type AnalyticsSplitOption = 'none' | 'sex' | 'age' | 'camera' | 'site';
export type AnalyticsAggregateOption = 'sum' | 'mean' | 'median' | 'p90' | 'count_distinct';
export type AnalyticsWindowOption = 'range' | 'trailing_7_days' | 'trailing_30_days';
export type AnalyticsChartType =
  | 'line'
  | 'area'
  | 'bar'
  | 'stacked_bar'
  | 'horizontal_bar'
  | 'pie'
  | 'heatmap';
export type AnalyticsAxisKey = 'people' | 'events' | 'throughput' | 'dwell';

export type AnalyticsFilterField =
  | 'event_type'
  | 'sex'
  | 'age_band'
  | 'camera_id'
  | 'site_id'
  | 'index'
  | 'track_id'
  | 'timestamp'
  | 'weekday';

export type AnalyticsFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'gte'
  | 'lte'
  | 'between'
  | 'relative';

export type RelativePreset =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_12_weeks'
  | 'same_day_last_week'
  | 'same_period_last_year';

export type AnalyticsFilterValue =
  | string
  | string[]
  | number
  | { from: string; to: string }
  | { preset: RelativePreset; amount?: number };

export interface AnalyticsFilterCondition {
  id: string;
  type: 'condition';
  field: AnalyticsFilterField;
  operator: AnalyticsFilterOperator;
  value: AnalyticsFilterValue;
}

export interface AnalyticsFilterGroup {
  id: string;
  type: 'group';
  logic: 'AND' | 'OR';
  children: AnalyticsFilterNode[];
}

export type AnalyticsFilterNode = AnalyticsFilterCondition | AnalyticsFilterGroup;

export interface AnalyticsBuilderState {
  dataset: AnalyticsDatasetOption;
  xAxis: AnalyticsXAxisOption;
  granularity: GranularityOption;
  yMetrics: AnalyticsMetricOption[];
  splitBy: AnalyticsSplitOption;
  aggregate: AnalyticsAggregateOption;
  window: AnalyticsWindowOption;
  chartType: AnalyticsChartType;
  axisAssignments: Record<AnalyticsMetricOption, AnalyticsAxisKey>;
  filters: AnalyticsFilterGroup;
}

export interface AnalyticsSeriesDefinition {
  key: string;
  label: string;
  axis: AnalyticsAxisKey;
  color: string;
  geometry: 'line' | 'area' | 'bar';
  stackId?: string;
  isComparison?: boolean;
}

export interface AnalyticsHeatmapCell {
  weekday: string;
  hour: number;
  value: number;
}

export interface AnalyticsHeatmapResult {
  metric: AnalyticsMetricOption;
  cells: AnalyticsHeatmapCell[];
  maxValue: number;
}

export interface AnalyticsPieSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface AnalyticsPieResult {
  metric: AnalyticsMetricOption;
  total: number;
  segments: AnalyticsPieSegment[];
}

export interface AnalyticsResultSummary {
  bucketCount: number;
  from: Date;
  to: Date;
}

export interface AnalyticsResult {
  data: Array<Record<string, string | number>>;
  series: AnalyticsSeriesDefinition[];
  xKey: 'label' | 'category';
  xType: 'time' | 'category';
  chartType: AnalyticsChartType;
  summary: AnalyticsResultSummary;
  heatmap?: AnalyticsHeatmapResult;
  pie?: AnalyticsPieResult;
}

const METRIC_LABELS: Record<AnalyticsMetricOption, string> = {
  occupancy: 'Occupancy',
  entrances: 'Entrances',
  exits: 'Exits',
  activity: 'Activity',
  throughput: 'Throughput',
  avg_dwell: 'Avg dwell',
  p90_dwell: 'P90 dwell',
  unique_tracks: 'Unique tracks',
};

const METRIC_AXIS: Record<AnalyticsMetricOption, AnalyticsAxisKey> = {
  occupancy: 'people',
  entrances: 'events',
  exits: 'events',
  activity: 'events',
  throughput: 'throughput',
  avg_dwell: 'dwell',
  p90_dwell: 'dwell',
  unique_tracks: 'events',
};

const METRIC_COLORS: Record<AnalyticsMetricOption, string> = {
  occupancy: 'var(--vrm-color-accent-occupancy)',
  entrances: 'var(--vrm-color-accent-entrances)',
  exits: 'var(--vrm-color-accent-exits)',
  activity: 'var(--vrm-color-accent-dwell)',
  throughput: 'var(--vrm-color-accent-entrances)',
  avg_dwell: 'var(--vrm-color-accent-dwell)',
  p90_dwell: 'var(--vrm-color-accent-dwell)',
  unique_tracks: 'var(--vrm-color-accent-insight)',
};

const SPLIT_COLORS = [
  'var(--vrm-color-accent-entrances)',
  'var(--vrm-color-accent-exits)',
  'var(--vrm-color-accent-dwell)',
  'var(--vrm-color-accent-occupancy)',
  'var(--vrm-color-accent-insight)',
  'var(--vrm-color-accent-warning)',
];

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const generateId = (): string => {
  if (typeof crypto !== 'undefined') {
    const randomUUID = (crypto as { randomUUID?: () => string }).randomUUID;
    if (typeof randomUUID === 'function') {
      return randomUUID();
    }
  }
  return `f-${Math.random().toString(36).slice(2, 10)}`;
};

const defaultAxisAssignments = (): Record<AnalyticsMetricOption, AnalyticsAxisKey> => ({
  occupancy: 'people',
  entrances: 'events',
  exits: 'events',
  activity: 'events',
  throughput: 'throughput',
  avg_dwell: 'dwell',
  p90_dwell: 'dwell',
  unique_tracks: 'events',
});

const cloneAxisAssignments = (
  source: Record<AnalyticsMetricOption, AnalyticsAxisKey>,
): Record<AnalyticsMetricOption, AnalyticsAxisKey> => ({ ...source });

export const createFilterGroup = (logic: 'AND' | 'OR' = 'AND'): AnalyticsFilterGroup => ({
  id: generateId(),
  type: 'group',
  logic,
  children: [],
});

export const createFilterCondition = (
  field: AnalyticsFilterField = 'event_type',
): AnalyticsFilterCondition => ({
  id: generateId(),
  type: 'condition',
  field,
  operator: field === 'timestamp' ? 'between' : field === 'index' ? 'gte' : field === 'weekday' ? 'in' : 'equals',
  value:
    field === 'event_type'
      ? 'entry'
      : field === 'timestamp'
      ? { from: new Date().toISOString(), to: new Date().toISOString() }
      : field === 'weekday'
      ? []
      : field === 'index'
      ? 0
      : '',
});

export const defaultAnalyticsBuilderState = (): AnalyticsBuilderState => ({
  dataset: 'events',
  xAxis: 'time_bucket',
  granularity: 'hour',
  yMetrics: ['activity', 'occupancy'],
  splitBy: 'none',
  aggregate: 'sum',
  window: 'range',
  chartType: 'area',
  axisAssignments: defaultAxisAssignments(),
  filters: { id: 'root', type: 'group', logic: 'AND', children: [] },
});

const normalizeArray = <T>(values: T[]): T[] => Array.from(new Set(values));

const aggregateValues = (values: number[], aggregate: AnalyticsAggregateOption): number => {
  if (!values.length) {
    return 0;
  }
  if (aggregate === 'sum') {
    return values.reduce((total, value) => total + value, 0);
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (aggregate === 'mean') {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }
  if (aggregate === 'median') {
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  if (aggregate === 'p90') {
    const index = Math.min(sorted.length - 1, Math.round(0.9 * (sorted.length - 1)));
    return sorted[index];
  }
  if (aggregate === 'count_distinct') {
    return new Set(values).size;
  }
  return 0;
};

const computeRelativeRange = (preset: RelativePreset, amount?: number): { from: Date; to: Date } => {
  const now = new Date();
  const to = new Date(now);
  if (preset === 'last_7_days' || preset === 'last_30_days' || preset === 'last_12_weeks') {
    const days = preset === 'last_7_days' ? 7 : preset === 'last_30_days' ? 30 : (amount ?? 12) * 7;
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { from, to };
  }
  if (preset === 'same_day_last_week') {
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const toLastWeek = new Date(from);
    toLastWeek.setHours(23, 59, 59, 999);
    from.setHours(0, 0, 0, 0);
    return { from, to: toLastWeek };
  }
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  return { from, to };
};

const resolveFieldValue = (item: ChartData, field: AnalyticsFilterField): string | number | Date | null => {
  switch (field) {
    case 'event_type':
      return item.event ?? null;
    case 'sex':
      return item.sex ?? null;
    case 'age_band':
      return getAgeBand(item.age_estimate);
    case 'camera_id':
      return item.camera_id != null ? String(item.camera_id) : null;
    case 'site_id':
      return item.site_id != null ? String(item.site_id) : null;
    case 'index':
      return item.index ?? null;
    case 'track_id':
      return item.track_number ?? null;
    case 'timestamp':
      return item.timestamp ? new Date(item.timestamp) : null;
    case 'weekday': {
      if (!item.timestamp) {
        return null;
      }
      const date = new Date(item.timestamp);
      const dayIndex = date.getDay();
      return WEEKDAY_ORDER[dayIndex === 0 ? 6 : dayIndex - 1];
    }
    default:
      return null;
  }
};

const evaluateCondition = (item: ChartData, condition: AnalyticsFilterCondition): boolean => {
  const { field, operator, value } = condition;
  const resolved = resolveFieldValue(item, field);
  if (resolved == null) {
    return false;
  }

  if (operator === 'equals' || operator === 'not_equals') {
    const lhs = typeof resolved === 'string' ? resolved.toLowerCase() : String(resolved).toLowerCase();
    const rhs = typeof value === 'string' ? value.toLowerCase() : String(value).toLowerCase();
    const match = lhs === rhs;
    return operator === 'equals' ? match : !match;
  }

  if (operator === 'in' || operator === 'not_in') {
    const pool = Array.isArray(value)
      ? value.map(entry => entry.toString().toLowerCase())
      : String(value ?? '')
          .split(',')
          .map(entry => entry.trim().toLowerCase())
          .filter(Boolean);
    const candidate = typeof resolved === 'string' ? resolved.toLowerCase() : String(resolved).toLowerCase();
    const match = pool.includes(candidate);
    return operator === 'in' ? match : !match;
  }

  if (operator === 'gte' || operator === 'lte') {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (resolved instanceof Date) {
      const timestamp = resolved.getTime();
      const bound = numericValue ? numericValue : 0;
      return operator === 'gte' ? timestamp >= bound : timestamp <= bound;
    }
    const numericResolved = Number(resolved);
    if (Number.isNaN(numericResolved) || Number.isNaN(numericValue)) {
      return false;
    }
    return operator === 'gte' ? numericResolved >= numericValue : numericResolved <= numericValue;
  }

  if (operator === 'between' && typeof value === 'object' && value != null && 'from' in value && 'to' in value) {
    const fromDate = new Date(value.from);
    const toDate = new Date(value.to);
    const target = resolved instanceof Date ? resolved : new Date(resolved as number);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || Number.isNaN(target.getTime())) {
      return false;
    }
    return target >= fromDate && target <= toDate;
  }

  if (operator === 'relative' && typeof value === 'object' && value != null && 'preset' in value) {
    const range = computeRelativeRange(value.preset, value.amount);
    const target = resolved instanceof Date ? resolved : new Date(resolved as number);
    if (Number.isNaN(target.getTime())) {
      return false;
    }
    return target >= range.from && target <= range.to;
  }

  return false;
};

const evaluateNode = (item: ChartData, node: AnalyticsFilterNode): boolean => {
  if (node.type === 'condition') {
    return evaluateCondition(item, node);
  }
  if (!node.children.length) {
    return true;
  }
  if (node.logic === 'AND') {
    return node.children.every(child => evaluateNode(item, child));
  }
  return node.children.some(child => evaluateNode(item, child));
};

const applyFilters = (data: ChartData[], root: AnalyticsFilterGroup): ChartData[] => {
  if (!root.children.length) {
    return data;
  }
  return data.filter(item => evaluateNode(item, root));
};

const applyWindow = (range: DateRange, option: AnalyticsWindowOption): DateRange => {
  if (option === 'range') {
    return range;
  }
  const durationMs = option === 'trailing_7_days' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  const end = new Date(range.to);
  const from = new Date(Math.max(range.from.getTime(), end.getTime() - durationMs));
  return { from, to: end };
};

const filterBySplit = (data: ChartData[], splitBy: AnalyticsSplitOption, value: string): ChartData[] => {
  if (splitBy === 'none') {
    return data;
  }
  if (splitBy === 'sex') {
    return data.filter(item => (item.sex ?? '').toLowerCase() === value.toLowerCase());
  }
  if (splitBy === 'age') {
    return data.filter(item => (getAgeBand(item.age_estimate) ?? '').toLowerCase() === value.toLowerCase());
  }
  if (splitBy === 'camera') {
    return data.filter(item => String(item.camera_id ?? '') === value);
  }
  if (splitBy === 'site') {
    return data.filter(item => String(item.site_id ?? '') === value);
  }
  return data;
};

const getSplitValues = (data: ChartData[], splitBy: AnalyticsSplitOption): string[] => {
  if (splitBy === 'none') {
    return ['all'];
  }
  if (splitBy === 'sex') {
    const values = new Set<string>();
    data.forEach(item => {
      const sex = item.sex?.toLowerCase();
      if (sex === 'male' || sex === 'female') {
        values.add(sex);
      }
    });
    return values.size ? Array.from(values) : ['all'];
  }
  if (splitBy === 'age') {
    const values = new Set<string>();
    data.forEach(item => {
      const band = getAgeBand(item.age_estimate);
      if (band) {
        values.add(band);
      }
    });
    return values.size ? Array.from(values) : ['all'];
  }
  if (splitBy === 'camera') {
    const values = new Set<string>();
    data.forEach(item => {
      if (item.camera_id != null) {
        values.add(String(item.camera_id));
      }
    });
    return values.size ? Array.from(values) : ['all'];
  }
  if (splitBy === 'site') {
    const values = new Set<string>();
    data.forEach(item => {
      if (item.site_id != null) {
        values.add(String(item.site_id));
      }
    });
    return values.size ? Array.from(values) : ['all'];
  }
  return ['all'];
};

const metricValueFromPoint = (
  point: NormalizedChartPoint,
  metric: AnalyticsMetricOption,
): number => {
  switch (metric) {
    case 'occupancy':
      return point.occupancy;
    case 'entrances':
      return point.entries;
    case 'exits':
      return point.exits;
    case 'activity':
      return point.activity;
    case 'throughput':
      return point.bucketMinutes > 0 ? point.activity / point.bucketMinutes : 0;
    case 'avg_dwell':
      return point.dwellMean;
    case 'p90_dwell':
      return point.dwellP90;
    case 'unique_tracks':
      return point.uniqueTracks;
    default:
      return 0;
  }
};

const resolveSeriesKey = (metric: AnalyticsMetricOption, splitValue: string, suffix?: string) =>
  `${metric}__${splitValue}${suffix ? `__${suffix}` : ''}`;

const resolveSeriesLabel = (metric: AnalyticsMetricOption, splitValue: string, comparison?: boolean) => {
  const base = METRIC_LABELS[metric];
  if (splitValue === 'all') {
    return comparison ? `${base} (comparison)` : base;
  }
  return comparison ? `${base} · ${splitValue} (comparison)` : `${base} · ${splitValue}`;
};

const colorForSeries = (metric: AnalyticsMetricOption, splitIndex: number, comparison?: boolean) => {
  if (splitIndex === 0) {
    const base = METRIC_COLORS[metric];
    return comparison ? `${base}80` : base;
  }
  const base = SPLIT_COLORS[splitIndex % SPLIT_COLORS.length];
  return comparison ? `${base}80` : base;
};

const ensureAxisAssignments = (
  assignments: Record<AnalyticsMetricOption, AnalyticsAxisKey>,
  metrics: AnalyticsMetricOption[],
): Record<AnalyticsMetricOption, AnalyticsAxisKey> => {
  const next = cloneAxisAssignments(assignments);
  metrics.forEach(metric => {
    if (!next[metric]) {
      next[metric] = METRIC_AXIS[metric];
    }
  });
  return next;
};

const buildTimeBucketResult = (
  data: ChartData[],
  controls: CardControlState,
  builder: AnalyticsBuilderState,
  intelligence: IntelligencePayload | null,
): AnalyticsResult => {
  const baseRange = getDateRangeFromPreset(controls.rangePreset, controls.customRange);
  const windowedRange = applyWindow(baseRange, builder.window);
  const scopedData = applyFilters(filterDataByControls(data, controls, { rangeOverride: windowedRange }), builder.filters);
  const splitValues = getSplitValues(scopedData, builder.splitBy);
  const baseSeries = computeChartSeries(scopedData, builder.granularity, intelligence);
  const records = new Map<string, Record<string, string | number>>();

  baseSeries.series.forEach((point, index) => {
    records.set(point.bucketStart, {
      label: point.label,
      bucketStart: point.bucketStart,
      bucketMinutes: point.bucketMinutes,
      order: index,
    });
  });

  const series: AnalyticsSeriesDefinition[] = [];

  splitValues.forEach((splitValue, splitIndex) => {
    const subset = builder.splitBy === 'none' && splitValue === 'all'
      ? scopedData
      : filterBySplit(scopedData, builder.splitBy, splitValue);
    if (!subset.length) {
      return;
    }
    const seriesForSplit = computeChartSeries(subset, builder.granularity, intelligence);
    builder.yMetrics.forEach(metric => {
      const seriesKey = resolveSeriesKey(metric, splitValue);
      const geometry = builder.chartType === 'line'
        ? 'line'
        : builder.chartType === 'area'
        ? 'area'
        : 'bar';
      series.push({
        key: seriesKey,
        label: resolveSeriesLabel(metric, splitValue),
        axis: builder.axisAssignments[metric] ?? METRIC_AXIS[metric],
        color: colorForSeries(metric, splitIndex),
        geometry,
        stackId: builder.chartType === 'stacked_bar' ? `${metric}-stack` : undefined,
      });
      seriesForSplit.series.forEach(point => {
        const record = records.get(point.bucketStart);
        if (record) {
          record[seriesKey] = Number(
            metricValueFromPoint(point, metric).toFixed(metric === 'throughput' || metric === 'avg_dwell' ? 2 : 0),
          );
        }
      });
    });
  });

  if (controls.compare !== 'off') {
    const comparisonRange = deriveComparisonRange(windowedRange, controls.compare);
    if (comparisonRange) {
      const comparisonScoped = applyFilters(
        filterDataByControls(data, controls, { rangeOverride: comparisonRange }),
        builder.filters,
      );
      const comparisonSplitValues = getSplitValues(comparisonScoped, builder.splitBy);
      comparisonSplitValues.forEach((splitValue, splitIndex) => {
        const subset = builder.splitBy === 'none' && splitValue === 'all'
          ? comparisonScoped
          : filterBySplit(comparisonScoped, builder.splitBy, splitValue);
        if (!subset.length) {
          return;
        }
        const comparisonSeries = computeChartSeries(subset, builder.granularity, intelligence);
        builder.yMetrics.forEach(metric => {
          const seriesKey = resolveSeriesKey(metric, splitValue, 'comparison');
          const geometry = builder.chartType === 'line' ? 'line' : builder.chartType === 'area' ? 'area' : 'bar';
          series.push({
            key: seriesKey,
            label: resolveSeriesLabel(metric, splitValue, true),
            axis: builder.axisAssignments[metric] ?? METRIC_AXIS[metric],
            color: colorForSeries(metric, splitIndex, true),
            geometry,
            stackId: builder.chartType === 'stacked_bar' ? `${metric}-stack-comparison` : undefined,
            isComparison: true,
          });
          comparisonSeries.series.forEach((point, index) => {
            const anchor = baseSeries.series[index]?.bucketStart ?? point.bucketStart;
            const record = records.get(anchor);
            if (record) {
              record[seriesKey] = Number(
                metricValueFromPoint(point, metric).toFixed(metric === 'throughput' || metric === 'avg_dwell' ? 2 : 0),
              );
            }
          });
        });
      });
    }
  }

  const dataSet = Array.from(records.values())
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map(({ order, ...rest }) => rest);

  let heatmap: AnalyticsHeatmapResult | undefined;
  if (builder.chartType === 'heatmap') {
    const metric = builder.yMetrics[0];
    const aggregate = new Map<string, { weekday: string; hour: number; total: number; samples: number }>();
    baseSeries.series.forEach(point => {
      const bucketDate = new Date(point.bucketStart);
      const dayIndex = bucketDate.getDay();
      const weekday = WEEKDAY_ORDER[dayIndex === 0 ? 6 : dayIndex - 1];
      const hour = point.hourOfDay ?? bucketDate.getHours();
      const key = `${weekday}-${hour}`;
      const value = metricValueFromPoint(point, metric);
      const existing = aggregate.get(key) ?? { weekday, hour, total: 0, samples: 0 };
      existing.total += value;
      existing.samples += 1;
      aggregate.set(key, existing);
    });
    const cells: AnalyticsHeatmapCell[] = Array.from(aggregate.values()).map(entry => ({
      weekday: entry.weekday,
      hour: entry.hour,
      value: entry.samples > 0 ? entry.total / entry.samples : 0,
    }));
    const maxValue = cells.length ? Math.max(...cells.map(cell => cell.value)) : 0;
    heatmap = {
      metric,
      cells,
      maxValue,
    };
  }

  let pie: AnalyticsPieResult | undefined;
  if (builder.chartType === 'pie') {
    const metric = builder.yMetrics[0];
    const aggregated = new Map<string, number>();
    splitValues.forEach(splitValue => {
      const key = resolveSeriesKey(metric, splitValue);
      const total = dataSet.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
      aggregated.set(splitValue, total);
    });
    const total = Array.from(aggregated.values()).reduce((sum, value) => sum + value, 0);
    const segments: AnalyticsPieSegment[] = Array.from(aggregated.entries()).map(([splitValue, value], index) => ({
      id: resolveSeriesKey(metric, splitValue),
      label: splitValue === 'all' ? 'All' : splitValue,
      value,
      color: colorForSeries(metric, index),
    }));
    pie = { metric, total, segments };
  }

  return {
    data: dataSet,
    series,
    xKey: 'label',
    xType: 'time',
    chartType: builder.chartType,
    summary: {
      bucketCount: dataSet.length,
      from: windowedRange.from,
      to: windowedRange.to,
    },
    heatmap,
    pie,
  };
};

const buildGroupedResult = (
  data: ChartData[],
  controls: CardControlState,
  builder: AnalyticsBuilderState,
  intelligence: IntelligencePayload | null,
  mode: 'weekday' | 'camera' | 'site',
): AnalyticsResult => {
  const baseRange = getDateRangeFromPreset(controls.rangePreset, controls.customRange);
  const windowed = applyWindow(baseRange, builder.window);
  const scopedData = applyFilters(filterDataByControls(data, controls, { rangeOverride: windowed }), builder.filters);
  const splitValues = getSplitValues(scopedData, builder.splitBy);
  const buckets = new Map<string, Record<string, string | number>>();
  const series: AnalyticsSeriesDefinition[] = [];

  const gatherKey = (item: ChartData): string => {
    if (mode === 'weekday') {
      if (!item.timestamp) {
        return 'Unspecified';
      }
      const date = new Date(item.timestamp);
      return WEEKDAY_ORDER[date.getDay() === 0 ? 6 : date.getDay() - 1];
    }
    if (mode === 'camera') {
      return item.camera_id != null ? String(item.camera_id) : 'Unassigned';
    }
    return item.site_id != null ? String(item.site_id) : 'Unassigned';
  };

  splitValues.forEach((splitValue, splitIndex) => {
    const subset = builder.splitBy === 'none' && splitValue === 'all'
      ? scopedData
      : filterBySplit(scopedData, builder.splitBy, splitValue);
    if (!subset.length) {
      return;
    }

    const grouped = new Map<string, ChartData[]>();
    subset.forEach(item => {
      const key = gatherKey(item);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    });

    builder.yMetrics.forEach(metric => {
      const descriptorKey = resolveSeriesKey(metric, splitValue);
      const geometry = builder.chartType === 'line'
        ? 'line'
        : builder.chartType === 'area'
        ? 'area'
        : 'bar';
      if (!series.some(entry => entry.key === descriptorKey)) {
        series.push({
          key: descriptorKey,
          label: resolveSeriesLabel(metric, splitValue),
          axis: builder.axisAssignments[metric] ?? METRIC_AXIS[metric],
          color: colorForSeries(metric, splitIndex),
          geometry,
          stackId: builder.chartType === 'stacked_bar' ? `${metric}-stack` : undefined,
        });
      }

      grouped.forEach((eventsForCategory, category) => {
        if (!buckets.has(category)) {
          buckets.set(category, { category });
        }
        const record = buckets.get(category)!;
        const normalizedSeries = computeChartSeries(eventsForCategory, builder.granularity, intelligence);
        const values = normalizedSeries.series.map(point => metricValueFromPoint(point, metric));
        const aggregated = builder.aggregate === 'count_distinct' && metric === 'activity'
          ? new Set(eventsForCategory.map(item => item.track_number)).size
          : aggregateValues(values, builder.aggregate);
        record[descriptorKey] = Number(
          aggregated.toFixed(metric === 'throughput' || metric === 'avg_dwell' ? 2 : 0),
        );
      });
    });
  });

  const ordered = Array.from(buckets.values()).sort((a, b) => {
    if (mode === 'weekday') {
      return (
        WEEKDAY_ORDER.indexOf(String(a.category)) - WEEKDAY_ORDER.indexOf(String(b.category))
      );
    }
    return String(a.category).localeCompare(String(b.category));
  });

  let pie: AnalyticsPieResult | undefined;
  if (builder.chartType === 'pie') {
    const metric = builder.yMetrics[0];
    const segments = ordered.map((row, index) => {
      const value = builder.splitBy === 'none'
        ? Number(row[resolveSeriesKey(metric, 'all')] ?? 0)
        : splitValues.reduce(
            (sum, split) => sum + Number(row[resolveSeriesKey(metric, split)] ?? 0),
            0,
          );
      return {
        id: `${row.category}-${metric}`,
        label: String(row.category ?? 'Unspecified'),
        value,
        color: colorForSeries(metric, index),
      };
    });
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    pie = { metric, total, segments };
  }

  return {
    data: ordered,
    series,
    xKey: 'category',
    xType: 'category',
    chartType: builder.chartType,
    summary: {
      bucketCount: ordered.length,
      from: windowed.from,
      to: windowed.to,
    },
    pie,
  };
};

export const buildAnalyticsResult = (
  data: ChartData[],
  controls: CardControlState,
  builder: AnalyticsBuilderState,
  intelligence: IntelligencePayload | null,
): AnalyticsResult => {
  if (builder.xAxis === 'time_bucket') {
    return buildTimeBucketResult(data, controls, builder, intelligence);
  }
  if (builder.xAxis === 'weekday') {
    return buildGroupedResult(data, controls, builder, intelligence, 'weekday');
  }
  if (builder.xAxis === 'camera') {
    return buildGroupedResult(data, controls, builder, intelligence, 'camera');
  }
  return buildGroupedResult(data, controls, builder, intelligence, 'site');
};

const METRIC_COMPATIBILITY: Record<AnalyticsXAxisOption, AnalyticsMetricOption[]> = {
  time_bucket: [
    'occupancy',
    'entrances',
    'exits',
    'activity',
    'throughput',
    'avg_dwell',
    'p90_dwell',
    'unique_tracks',
  ],
  weekday: ['entrances', 'exits', 'activity', 'avg_dwell', 'p90_dwell', 'unique_tracks'],
  camera: ['entrances', 'exits', 'activity', 'avg_dwell', 'p90_dwell', 'unique_tracks'],
  site: ['entrances', 'exits', 'activity', 'avg_dwell', 'p90_dwell', 'unique_tracks'],
};

export const getAvailableMetrics = (
  xAxis: AnalyticsXAxisOption,
  dataset: AnalyticsDatasetOption,
): AnalyticsMetricOption[] => {
  const base = METRIC_COMPATIBILITY[xAxis];
  if (dataset === 'occupancy') {
    return base.filter(metric => metric === 'occupancy' || metric === 'activity');
  }
  if (dataset === 'dwell') {
    return base.filter(metric => metric === 'avg_dwell' || metric === 'p90_dwell');
  }
  return base;
};

const METRIC_AGGREGATES: Record<AnalyticsMetricOption, AnalyticsAggregateOption[]> = {
  occupancy: ['mean', 'p90'],
  entrances: ['sum', 'mean'],
  exits: ['sum', 'mean'],
  activity: ['sum', 'mean', 'count_distinct'],
  throughput: ['mean', 'p90'],
  avg_dwell: ['mean', 'p90'],
  p90_dwell: ['p90'],
  unique_tracks: ['sum'],
};

export const getAvailableAggregates = (
  metrics: AnalyticsMetricOption[],
): AnalyticsAggregateOption[] => {
  if (!metrics.length) {
    return ['sum'];
  }
  const intersect = metrics.reduce<AnalyticsAggregateOption[]>((acc, metric) => {
    const allowed = METRIC_AGGREGATES[metric];
    if (!acc.length) {
      return [...allowed];
    }
    return acc.filter(option => allowed.includes(option));
  }, []);
  return intersect.length ? intersect : ['sum'];
};

export const getAvailableSplitOptions = (data: ChartData[]): AnalyticsSplitOption[] => {
  const options: AnalyticsSplitOption[] = ['none'];
  if (data.some(item => ['male', 'female'].includes((item.sex ?? '').toLowerCase()))) {
    options.push('sex');
  }
  if (data.some(item => getAgeBand(item.age_estimate))) {
    options.push('age');
  }
  if (data.some(item => item.camera_id != null)) {
    options.push('camera');
  }
  if (data.some(item => item.site_id != null)) {
    options.push('site');
  }
  return options;
};

export const getAvailableXAxisOptions = (data: ChartData[]): AnalyticsXAxisOption[] => {
  const options: AnalyticsXAxisOption[] = ['time_bucket'];
  if (data.length) {
    options.push('weekday');
  }
  if (data.some(item => item.camera_id != null)) {
    options.push('camera');
  }
  if (data.some(item => item.site_id != null)) {
    options.push('site');
  }
  return normalizeArray(options);
};

export const getAvailableChartTypes = (
  xAxis: AnalyticsXAxisOption,
  metrics: AnalyticsMetricOption[],
): AnalyticsChartType[] => {
  const hasTime = xAxis === 'time_bucket';
  const hasDwellMetric = metrics.some(metric => metric === 'avg_dwell' || metric === 'p90_dwell');
  const base: AnalyticsChartType[] = hasTime
    ? ['line', 'area', 'bar', 'stacked_bar', 'heatmap']
    : ['bar', 'stacked_bar', 'horizontal_bar', 'pie'];
  if (hasDwellMetric && hasTime) {
    base.push('area');
  }
  if (!base.includes('pie')) {
    base.push('pie');
  }
  return normalizeArray(base);
};

export const normalizeBuilderState = (
  state: AnalyticsBuilderState,
  data: ChartData[],
): AnalyticsBuilderState => {
  const availableXAxis = getAvailableXAxisOptions(data);
  const xAxis = availableXAxis.includes(state.xAxis) ? state.xAxis : availableXAxis[0];
  const metrics = getAvailableMetrics(xAxis, state.dataset);
  const yMetrics = state.yMetrics.filter(metric => metrics.includes(metric));
  const nextMetrics = yMetrics.length ? yMetrics : [metrics[0]];
  const aggregates = getAvailableAggregates(nextMetrics);
  const aggregate = aggregates.includes(state.aggregate) ? state.aggregate : aggregates[0];
  const axisAssignments = ensureAxisAssignments(state.axisAssignments, nextMetrics);
  const chartTypes = getAvailableChartTypes(xAxis, nextMetrics);
  const chartType = chartTypes.includes(state.chartType) ? state.chartType : chartTypes[0];
  const filters = state.filters ?? { id: 'root', type: 'group', logic: 'AND', children: [] };
  return {
    ...state,
    xAxis,
    yMetrics: nextMetrics,
    aggregate,
    axisAssignments,
    chartType,
    filters,
  };
};

