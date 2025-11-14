import type { ChartResult, ChartSpec } from '../../schemas/charting';
import type { PresetDefinition } from '../presets/types';
import type { WorkspaceOverrides } from '../state/workspaceStore';
import type { SeriesVisibilityMap } from '../../components/ChartRenderer/managers';
import { buildParameterBadges, buildSpecWithOverrides, overridesMatchDefaults } from './specOverrides';
import { deepEqual } from './deepEqual';

export interface SpecIntegrityCheckArgs {
  preset?: PresetDefinition;
  overrides: WorkspaceOverrides;
  spec?: ChartSpec;
  anchor: Date;
}

export const hasSpecDrift = ({ preset, overrides, spec, anchor }: SpecIntegrityCheckArgs): boolean => {
  if (!preset || !spec) {
    return false;
  }
  const canonical = buildSpecWithOverrides(preset, overrides, anchor);
  return !deepEqual(canonical, spec);
};

export const badgesMatchSpec = (
  preset: PresetDefinition | undefined,
  overrides: WorkspaceOverrides,
  badges: string[],
): boolean => {
  const expected = buildParameterBadges(preset, overrides);
  if (expected.length !== badges.length) {
    return false;
  }
  return expected.every((badge, index) => badge === badges[index]);
};

export const overridesAreDefault = (
  preset: PresetDefinition | undefined,
  overrides: WorkspaceOverrides,
): boolean => {
  return overridesMatchDefaults(preset, overrides);
};

export const legendVisibilityMatches = (
  result?: ChartResult,
  visibility?: SeriesVisibilityMap | null,
): boolean => {
  if (!result || !result.series.length || !visibility) {
    return true;
  }
  return result.series.every((series) => Object.prototype.hasOwnProperty.call(visibility, series.id));
};
