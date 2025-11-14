import type { ChartSpec, TimeWindow } from '../../schemas/charting';
import type { PresetDefinition, PresetTimeRangeOption } from '../presets/types';
import type { WorkspaceOverrides } from '../state/workspaceStore';
import { deepEqual } from './deepEqual';

const cloneSpec = (spec: ChartSpec): ChartSpec => JSON.parse(JSON.stringify(spec));

const subtractDuration = (anchor: Date, amount: number, unit: string): Date => {
  const next = new Date(anchor.getTime());
  switch (unit) {
    case 'hour':
      next.setHours(next.getHours() - amount);
      break;
    case 'day':
      next.setDate(next.getDate() - amount);
      break;
    case 'week':
      next.setDate(next.getDate() - amount * 7);
      break;
    case 'month':
      next.setMonth(next.getMonth() - amount);
      break;
    default:
      break;
  }
  return next;
};

const buildTimeWindow = (
  template: TimeWindow,
  option: PresetTimeRangeOption | undefined,
  anchor: Date,
): TimeWindow => {
  if (!option) {
    return template;
  }
  const to = new Date(anchor.getTime());
  const from = subtractDuration(to, option.duration.amount, option.duration.unit);
  return {
    ...template,
    from: from.toISOString(),
    to: to.toISOString(),
    bucket: option.bucket,
  };
};

export const resolveTimeRangeOption = (
  preset: PresetDefinition,
  overrides: WorkspaceOverrides,
): PresetTimeRangeOption | undefined => {
  const options = preset.overrides.timeRangeOptions;
  if (!options || options.length === 0) {
    return undefined;
  }
  const selectedId = overrides.timeRangeId ?? preset.overrides.defaultTimeRangeId ?? options[0].id;
  return options.find((option) => option.id === selectedId) ?? options[0];
};

export const resolveMeasureOption = (
  preset: PresetDefinition,
  overrides: WorkspaceOverrides,
) => {
  const options = preset.overrides.measureOptions;
  if (!options || options.length === 0) {
    return undefined;
  }
  const selectedId =
    overrides.measureOptionId ?? preset.overrides.defaultMeasureOptionId ?? options[0].id;
  return options.find((option) => option.id === selectedId) ?? options[0];
};

export const shouldEnableSplit = (
  preset: PresetDefinition,
  overrides: WorkspaceOverrides,
): boolean => {
  const splitToggle = preset.overrides.splitToggle;
  if (!splitToggle) {
    return true;
  }
  if (typeof overrides.splitEnabled === 'boolean') {
    return overrides.splitEnabled;
  }
  return splitToggle.enabledByDefault;
};

export const buildDefaultOverrides = (preset: PresetDefinition): WorkspaceOverrides => ({
  timeRangeId:
    preset.overrides.defaultTimeRangeId ?? preset.overrides.timeRangeOptions?.[0]?.id,
  splitEnabled: preset.overrides.splitToggle?.enabledByDefault,
  measureOptionId:
    preset.overrides.defaultMeasureOptionId ?? preset.overrides.measureOptions?.[0]?.id,
});

export const buildSpecWithOverrides = (
  preset: PresetDefinition,
  overrides: WorkspaceOverrides,
  anchor: Date = new Date(),
): ChartSpec => {
  const baseSpec = cloneSpec(preset.templateSpec);
  const selectedTimeRange = resolveTimeRangeOption(preset, overrides);
  baseSpec.timeWindow = buildTimeWindow(baseSpec.timeWindow, selectedTimeRange, anchor);

  if (preset.overrides.measureOptions?.length) {
    const measureOption = resolveMeasureOption(preset, overrides);
    if (measureOption) {
      const allowedIds = new Set(measureOption.measureIds);
      baseSpec.measures = preset.templateSpec.measures.filter((measure) =>
        allowedIds.has(measure.id),
      );
    }
  }

  if (!shouldEnableSplit(preset, overrides)) {
    baseSpec.splits = undefined;
  } else {
    baseSpec.splits = preset.templateSpec.splits;
  }

  return baseSpec;
};

export const buildParameterBadges = (
  preset: PresetDefinition | undefined,
  overrides: WorkspaceOverrides,
): string[] => {
  if (!preset) {
    return [];
  }
  const badges: string[] = [];
  const time = resolveTimeRangeOption(preset, overrides);
  if (time) {
    badges.push(time.label);
  }
  const measure = resolveMeasureOption(preset, overrides);
  if (measure) {
    badges.push(measure.label);
  }
  if (preset.overrides.splitToggle) {
    badges.push(
      `${preset.overrides.splitToggle.label}: ${shouldEnableSplit(preset, overrides) ? 'On' : 'Off'}`,
    );
  }
  return badges;
};

export const overridesMatchDefaults = (
  preset: PresetDefinition | undefined,
  overrides: WorkspaceOverrides,
): boolean => {
  if (!preset) {
    return false;
  }
  const defaults = buildDefaultOverrides(preset);
  return deepEqual(defaults, overrides);
};
