import { useEffect, useRef } from 'react';
import type { ChartResult, ChartSpec } from '../../schemas/charting';
import type { PresetDefinition } from '../presets/types';
import type { WorkspaceOverrides } from '../state/workspaceStore';
import type { SeriesVisibilityMap } from '../../components/ChartRenderer/managers';
import {
  badgesMatchSpec,
  hasSpecDrift,
  legendVisibilityMatches,
  overridesAreDefault,
} from './workspaceIntegrity';
import { buildDefaultOverrides, buildSpecWithOverrides } from './specOverrides';

const DEV_LOGGING_ENABLED = process.env.NODE_ENV !== 'production';

interface UseWorkspaceIntegrityChecksArgs {
  preset?: PresetDefinition;
  overrides: WorkspaceOverrides;
  spec?: ChartSpec;
  badges: string[];
  anchor: Date;
  result?: ChartResult;
  legendVisibility?: SeriesVisibilityMap | null;
}

export const useWorkspaceIntegrityChecks = ({
  preset,
  overrides,
  spec,
  badges,
  anchor,
  result,
  legendVisibility,
}: UseWorkspaceIntegrityChecksArgs) => {
  const baselineSpecRef = useRef<Record<string, ChartSpec>>({});

  useEffect(() => {
    if (!DEV_LOGGING_ENABLED || !preset) {
      return;
    }
    if (!badgesMatchSpec(preset, overrides, badges)) {
      console.warn('[analytics:v2] badgeMismatch', { presetId: preset.id, overrides, badges });
    }
  }, [preset, overrides, badges]);

  useEffect(() => {
    if (!DEV_LOGGING_ENABLED) {
      return;
    }
    if (hasSpecDrift({ preset, overrides, spec, anchor })) {
      console.warn('[analytics:v2] specDriftDetected', { presetId: preset?.id, overrides });
    }
  }, [preset, overrides, spec, anchor]);

  useEffect(() => {
    if (!DEV_LOGGING_ENABLED || !preset || !spec) {
      return;
    }
    if (overridesAreDefault(preset, overrides)) {
      const canonical = buildSpecWithOverrides(preset, overrides, anchor);
      const baseline = baselineSpecRef.current[preset.id];
      if (baseline && JSON.stringify(baseline) !== JSON.stringify(canonical)) {
        console.warn('[analytics:v2] resetSpecMismatch', { presetId: preset.id });
      }
      baselineSpecRef.current[preset.id] = canonical;
    }
  }, [preset, overrides, spec, anchor]);

  useEffect(() => {
    if (!DEV_LOGGING_ENABLED) {
      return;
    }
    if (!legendVisibilityMatches(result, legendVisibility)) {
      console.warn('[analytics:v2] legendOutOfSync', {
        presetId: preset?.id,
        visibility: legendVisibility,
      });
    }
  }, [preset, result, legendVisibility]);

  useEffect(() => {
    if (!DEV_LOGGING_ENABLED || !preset) {
      return;
    }
    if (!baselineSpecRef.current[preset.id]) {
      baselineSpecRef.current[preset.id] = buildSpecWithOverrides(
        preset,
        buildDefaultOverrides(preset),
        anchor,
      );
    }
  }, [preset, anchor]);
};
