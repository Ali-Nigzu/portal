import type {
  PresetCatalogueGroup,
  PresetDefinition,
  PresetMeasureOption,
  PresetTimeRangeOption,
} from './types';
import type { ChartSpec, TimeBucket } from '../../schemas/charting';
import { validatePresetCatalogue } from './presetValidator';

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.getOwnPropertyNames(value).forEach((key) => {
      const property = (value as Record<string, unknown>)[key];
      if (property && typeof property === 'object') {
        deepFreeze(property);
      }
    });
    return Object.freeze(value);
  }
  return value;
};

const immutableSpec = (spec: ChartSpec): ChartSpec => deepFreeze({ ...spec });

const DEFAULT_TIMEZONE = 'UTC';

const LIVE_BUCKETS: TimeBucket[] = ['5_MIN', '15_MIN', 'HOUR', 'DAY'];
const HOURLY_BUCKETS: TimeBucket[] = ['HOUR', 'DAY', 'WEEK'];
const RETENTION_BUCKETS: TimeBucket[] = ['WEEK', 'MONTH'];

const STANDARD_TIME_RANGES: PresetTimeRangeOption[] = [
  { id: '24h', label: 'Last 24 hours', duration: { amount: 24, unit: 'hour' }, bucket: 'HOUR' },
  { id: '7d', label: 'Last 7 days', duration: { amount: 7, unit: 'day' }, bucket: 'DAY' },
  { id: '30d', label: 'Last 30 days', duration: { amount: 30, unit: 'day' }, bucket: 'DAY' },
];

const LIVE_TIME_RANGES: PresetTimeRangeOption[] = [
  { id: '6h', label: 'Last 6 hours', duration: { amount: 6, unit: 'hour' }, bucket: '15_MIN' },
  { id: '24h', label: 'Last 24 hours', duration: { amount: 24, unit: 'hour' }, bucket: 'HOUR' },
  { id: '7d', label: 'Last 7 days', duration: { amount: 7, unit: 'day' }, bucket: 'DAY' },
];

const RETENTION_TIME_RANGES: PresetTimeRangeOption[] = [
  { id: '12w', label: 'Last 12 weeks', duration: { amount: 12, unit: 'week' }, bucket: 'WEEK' },
  { id: '24w', label: 'Last 24 weeks', duration: { amount: 24, unit: 'week' }, bucket: 'WEEK' },
  { id: '6m', label: 'Last 6 months', duration: { amount: 6, unit: 'month' }, bucket: 'MONTH' },
];

const LIVE_MEASURE_OPTIONS: PresetMeasureOption[] = [
  { id: 'entries_exits', label: 'Entries vs Exits', measureIds: ['entries', 'exits'] },
  { id: 'entries_only', label: 'Entries only', measureIds: ['entries'] },
  { id: 'exits_only', label: 'Exits only', measureIds: ['exits'] },
];

const presets: Record<string, PresetDefinition> = {
  live_flow: {
    id: 'live_flow',
    title: 'Live Flow',
    description: 'Entries vs exits with live coverage awareness.',
    icon: 'activity',
    category: 'Engagement',
    fixture: 'golden_dashboard_live_flow',
    templateSpec: immutableSpec({
      id: 'preset_live_flow',
      dataset: 'events',
      measures: [
        { id: 'entries', label: 'Entries', aggregation: 'count', eventTypes: [0] },
        { id: 'exits', label: 'Exits', aggregation: 'count', eventTypes: [1] },
      ],
      dimensions: [{ id: 'timestamp', column: 'timestamp', bucket: '5_MIN', sort: 'asc' }],
      splits: [{ id: 'site_id', column: 'site_id', limit: 5, sort: 'desc' }],
      timeWindow: {
        from: '2024-01-07T00:00:00Z',
        to: '2024-01-08T00:00:00Z',
        bucket: '5_MIN',
        timezone: DEFAULT_TIMEZONE,
      },
      chartType: 'composed_time',
      interactions: { zoom: true, hoverSync: true, seriesToggle: true, export: ['png', 'csv'] },
      displayHints: { y1Label: 'People' },
    }),
    overrides: {
      allowedBuckets: LIVE_BUCKETS,
      allowedFilterFields: ['site_id', 'camera_id'],
      allowedSplitDimensions: ['site_id', 'camera_id'],
      timeRangeOptions: LIVE_TIME_RANGES,
      defaultTimeRangeId: '24h',
      splitToggle: {
        dimensionId: 'site_id',
        label: 'Split by site',
        enabledByDefault: true,
      },
      measureOptions: LIVE_MEASURE_OPTIONS,
      defaultMeasureOptionId: 'entries_exits',
    },
  },
  dwell_by_camera: {
    id: 'dwell_by_camera',
    title: 'Average Dwell by Camera',
    description: 'Hourly average dwell benchmarked per camera.',
    icon: 'clock',
    category: 'Engagement',
    fixture: 'golden_dwell_by_camera',
    templateSpec: immutableSpec({
      id: 'preset_dwell_by_camera',
      dataset: 'events',
      measures: [{ id: 'avg_dwell', label: 'Avg dwell (s)', aggregation: 'dwell_mean' }],
      dimensions: [{ id: 'timestamp', column: 'timestamp', bucket: 'HOUR', sort: 'asc' }],
      splits: [{ id: 'camera_id', column: 'camera_id', limit: 6, sort: 'desc' }],
      timeWindow: {
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-08T00:00:00Z',
        bucket: 'HOUR',
        timezone: DEFAULT_TIMEZONE,
      },
      chartType: 'composed_time',
      interactions: { zoom: true, hoverSync: true, seriesToggle: true, export: ['png', 'csv'] },
      displayHints: { y1Label: 'Seconds' },
    }),
    overrides: {
      allowedBuckets: HOURLY_BUCKETS,
      allowedFilterFields: ['site_id', 'camera_id', 'zone'],
      allowedSplitDimensions: ['camera_id'],
      timeRangeOptions: STANDARD_TIME_RANGES,
      defaultTimeRangeId: '7d',
      splitToggle: {
        dimensionId: 'camera_id',
        label: 'Split by camera',
        enabledByDefault: true,
      },
    },
  },
  retention_heatmap: {
    id: 'retention_heatmap',
    title: 'Retention Heatmap',
    description: 'Week-over-week cohort retention heatmap.',
    icon: 'retention',
    category: 'Loyalty',
    fixture: 'golden_retention_heatmap',
    templateSpec: immutableSpec({
      id: 'preset_retention_heatmap',
      dataset: 'events',
      measures: [{ id: 'retention_rate', label: 'Retention %', aggregation: 'retention_rate' }],
      dimensions: [{ id: 'cohort_week', column: 'cohort_week', bucket: 'WEEK', sort: 'asc' }],
      splits: [{ id: 'retention_week', column: 'retention_week', sort: 'asc' }],
      timeWindow: {
        from: '2023-10-01T00:00:00Z',
        to: '2024-01-01T00:00:00Z',
        bucket: 'WEEK',
        timezone: DEFAULT_TIMEZONE,
      },
      chartType: 'retention',
      interactions: { export: ['png', 'csv'] },
      displayHints: { y1Label: 'Retention %' },
    }),
    overrides: {
      allowedBuckets: RETENTION_BUCKETS,
      allowedFilterFields: ['site_id', 'segment'],
      allowedSplitDimensions: ['retention_week'],
      timeRangeOptions: RETENTION_TIME_RANGES,
      defaultTimeRangeId: '24w',
    },
  },
};

validatePresetCatalogue(Object.values(presets));

export const PRESET_GROUPS: PresetCatalogueGroup[] = [
  { id: 'featured', title: 'Featured', presetIds: ['live_flow', 'dwell_by_camera'] },
  { id: 'loyalty', title: 'Loyalty', presetIds: ['retention_heatmap'] },
];

export function listPresets(): PresetDefinition[] {
  return Object.values(presets);
}

export function getPresetById(id: string): PresetDefinition | undefined {
  return presets[id];
}

export function listPresetsByGroup(groupId: string): PresetDefinition[] {
  const group = PRESET_GROUPS.find((g) => g.id === groupId);
  if (!group) {
    return [];
  }
  return group.presetIds
    .map((presetId) => presets[presetId])
    .filter((preset): preset is PresetDefinition => Boolean(preset));
}
