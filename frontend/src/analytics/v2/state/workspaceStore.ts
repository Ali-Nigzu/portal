import { useReducer } from 'react';
import type { AnalyticsTransportMode } from '../../../config';
import type { ChartResult, ChartSpec } from '../../schemas/charting';
import type { PresetDefinition } from '../presets/types';
import type {
  AnalyticsRunDiagnostics,
  TransportErrorCategory,
} from '../transport/runAnalytics';

export interface WorkspaceOverrides {
  timeRangeId?: string;
  splitEnabled?: boolean;
  measureOptionId?: string;
}

export interface WorkspaceState {
  activePresetId: string | null;
  isLoading: boolean;
  error?: string;
  errorCategory?: TransportErrorCategory;
  result?: ChartResult;
  spec?: ChartSpec;
  specHash?: string;
  transportMode: AnalyticsTransportMode;
  overrides: WorkspaceOverrides;
  allowedOverrideFields: (keyof WorkspaceOverrides)[];
  diagnostics?: AnalyticsRunDiagnostics;
}

type WorkspaceAction =
  | { type: 'SELECT_PRESET'; preset: PresetDefinition; overrides: WorkspaceOverrides }
  | { type: 'RUN_START'; spec: ChartSpec }
  | {
      type: 'RUN_SUCCESS';
      payload: { result: ChartResult; spec: ChartSpec; specHash: string; diagnostics: AnalyticsRunDiagnostics };
    }
  | { type: 'RUN_FAILURE'; error: string; category?: TransportErrorCategory }
  | { type: 'RUN_CANCELLED' }
  | { type: 'RESET_OVERRIDES'; preset: PresetDefinition; overrides: WorkspaceOverrides }
  | { type: 'UPDATE_OVERRIDES'; overrides: Partial<WorkspaceOverrides> };

const DEV_LOGGING_ENABLED = process.env.NODE_ENV !== 'production';

const deriveAllowedOverrideFields = (
  preset: PresetDefinition | null,
): (keyof WorkspaceOverrides)[] => {
  if (!preset) {
    return [];
  }
  const allowed: (keyof WorkspaceOverrides)[] = [];
  if (preset.overrides.timeRangeOptions?.length) {
    allowed.push('timeRangeId');
  }
  if (preset.overrides.splitToggle) {
    allowed.push('splitEnabled');
  }
  if (preset.overrides.measureOptions?.length) {
    allowed.push('measureOptionId');
  }
  return allowed;
};

const logOverrideDiffs = (
  presetId: string | null,
  prev: WorkspaceOverrides = {},
  next: WorkspaceOverrides = {},
) => {
  if (!DEV_LOGGING_ENABLED || !presetId) {
    return;
  }
  (Object.keys({ ...prev, ...next }) as (keyof WorkspaceOverrides)[]).forEach((field) => {
    if (prev[field] !== next[field]) {
      console.info('[analytics:v2] overrideApplied', {
        presetId,
        field,
        oldValue: prev[field],
        newValue: next[field],
      });
    }
  });
};

const warnDisallowedOverride = (presetId: string | null, field: string) => {
  if (!DEV_LOGGING_ENABLED) {
    return;
  }
  console.warn('[analytics:v2] overrideDenied', { presetId, field });
};

const reducer = (state: WorkspaceState, action: WorkspaceAction): WorkspaceState => {
  switch (action.type) {
    case 'SELECT_PRESET':
      logOverrideDiffs(action.preset.id, state.overrides, action.overrides);
      return {
        ...state,
        activePresetId: action.preset.id,
        error: undefined,
        overrides: action.overrides,
        spec: undefined,
        specHash: undefined,
        result: undefined,
        allowedOverrideFields: deriveAllowedOverrideFields(action.preset),
      };
    case 'RUN_START':
      return { ...state, isLoading: true, error: undefined, spec: action.spec };
    case 'RUN_SUCCESS':
      return {
        ...state,
        isLoading: false,
        error: undefined,
        errorCategory: undefined,
        result: action.payload.result,
        spec: action.payload.spec,
        specHash: action.payload.specHash,
        diagnostics: action.payload.diagnostics,
      };
    case 'RUN_FAILURE':
      return {
        ...state,
        isLoading: false,
        error: action.error,
        errorCategory: action.category,
        diagnostics: undefined,
      };
    case 'RUN_CANCELLED':
      return { ...state, isLoading: false, error: undefined, errorCategory: undefined };
    case 'RESET_OVERRIDES':
      logOverrideDiffs(action.preset.id, state.overrides, action.overrides);
      return {
        ...state,
        overrides: action.overrides,
        allowedOverrideFields: deriveAllowedOverrideFields(action.preset),
      };
    case 'UPDATE_OVERRIDES':
      if (!state.activePresetId) {
        return state;
      }
      const allowed = new Set(state.allowedOverrideFields);
      const nextOverrides: WorkspaceOverrides = { ...state.overrides };
      const mutableOverrides = nextOverrides as Record<
        keyof WorkspaceOverrides,
        WorkspaceOverrides[keyof WorkspaceOverrides]
      >;
      (Object.entries(action.overrides) as [keyof WorkspaceOverrides, WorkspaceOverrides[keyof WorkspaceOverrides]][]).forEach(
        ([field, value]) => {
          if (!allowed.has(field)) {
            warnDisallowedOverride(state.activePresetId, field);
            return;
          }
          if (nextOverrides[field] !== value) {
            if (DEV_LOGGING_ENABLED) {
              console.info('[analytics:v2] overrideApplied', {
                presetId: state.activePresetId,
                field,
                oldValue: nextOverrides[field],
                newValue: value,
              });
            }
            mutableOverrides[field] = value;
          }
        },
      );
      return {
        ...state,
        overrides: nextOverrides,
      };
    default:
      return state;
  }
};

export const useWorkspaceStore = (
  initialPreset: PresetDefinition | null,
  initialOverrides: WorkspaceOverrides,
  transportMode: AnalyticsTransportMode,
) => {
  return useReducer(reducer, {
    activePresetId: initialPreset?.id ?? null,
    isLoading: false,
    transportMode,
    overrides: initialOverrides ?? {},
    allowedOverrideFields: deriveAllowedOverrideFields(initialPreset),
  } as WorkspaceState);
};

export { deriveAllowedOverrideFields };
export { reducer as workspaceReducer };
