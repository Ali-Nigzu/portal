import type { ChartSpec, TimeBucket } from '../../schemas/charting';
import type { ChartFixtureName } from '../../utils/loadChartFixture';

export type PresetIconName =
  | 'activity'
  | 'clock'
  | 'layers'
  | 'retention'
  | 'heatmap';

export type RelativeDurationUnit = 'hour' | 'day' | 'week' | 'month';

export interface RelativeDuration {
  amount: number;
  unit: RelativeDurationUnit;
}

export interface PresetTimeRangeOption {
  id: string;
  label: string;
  duration: RelativeDuration;
  bucket: TimeBucket;
}

export interface PresetSplitToggleConfig {
  dimensionId: string;
  label: string;
  enabledByDefault: boolean;
}

export interface PresetMeasureOption {
  id: string;
  label: string;
  measureIds: string[];
}

export interface PresetOverrideConfig {
  allowedBuckets?: TimeBucket[];
  allowedFilterFields?: string[];
  allowedSplitDimensions?: string[];
  timeRangeOptions?: PresetTimeRangeOption[];
  defaultTimeRangeId?: string;
  splitToggle?: PresetSplitToggleConfig;
  measureOptions?: PresetMeasureOption[];
  defaultMeasureOptionId?: string;
}

export interface PresetDefinition {
  id: string;
  title: string;
  description: string;
  icon: PresetIconName;
  category: string;
  templateSpec: ChartSpec;
  fixture: ChartFixtureName;
  overrides: PresetOverrideConfig;
}

export interface PresetCatalogueGroup {
  id: string;
  title: string;
  presetIds: string[];
}
