import type { PresetDefinition } from '../presets/types';
import type { ChartSpec } from '../../schemas/charting';
import type { WorkspaceOverrides, WorkspaceState } from './workspaceStore';
import { workspaceReducer } from './workspaceStore';
import { buildSpecWithOverrides } from '../utils/specOverrides';
import { hashChartSpec } from '../transport/hashChartSpec';

const templateSpec: ChartSpec = {
  id: 'test_spec',
  dataset: 'events',
  measures: [{ id: 'entries', label: 'Entries', aggregation: 'count' }],
  dimensions: [{ id: 'timestamp', column: 'timestamp', bucket: 'HOUR', sort: 'asc' }],
  timeWindow: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z', bucket: 'HOUR', timezone: 'UTC' },
  chartType: 'composed_time',
  interactions: { zoom: true },
};

const presetWithOptions: PresetDefinition = {
  id: 'live_flow',
  title: 'Live Flow',
  description: 'Test preset',
  icon: 'activity',
  category: 'Engagement',
  fixture: 'golden_dashboard_live_flow',
  templateSpec,
  overrides: {
    timeRangeOptions: [
      { id: '6h', label: 'Last 6 hours', duration: { amount: 6, unit: 'hour' }, bucket: 'HOUR' },
      { id: '24h', label: 'Last 24 hours', duration: { amount: 24, unit: 'hour' }, bucket: 'HOUR' },
    ],
    splitToggle: { dimensionId: 'site_id', label: 'Split by site', enabledByDefault: true },
    measureOptions: [
      { id: 'entries', label: 'Entries only', measureIds: ['entries'] },
      { id: 'exits', label: 'Exits only', measureIds: ['exits'] },
    ],
  },
};

const defaultState: WorkspaceState = {
  activePresetId: presetWithOptions.id,
  isLoading: false,
  transportMode: 'fixtures',
  overrides: { timeRangeId: '6h', splitEnabled: true, measureOptionId: 'entries' },
  allowedOverrideFields: ['timeRangeId', 'splitEnabled', 'measureOptionId'],
};

describe('workspaceReducer override guardrails', () => {
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('resets overrides when selecting a new preset', () => {
    const overrides: WorkspaceOverrides = { timeRangeId: '24h', splitEnabled: false, measureOptionId: 'exits' };
    const next = workspaceReducer(defaultState, {
      type: 'SELECT_PRESET',
      preset: presetWithOptions,
      overrides,
    });

    expect(next.overrides).toEqual(overrides);
    expect(next.allowedOverrideFields).toEqual(['timeRangeId', 'splitEnabled', 'measureOptionId']);
  });

  it('ignores disallowed override mutations', () => {
    const state: WorkspaceState = {
      ...defaultState,
      allowedOverrideFields: ['timeRangeId'],
    };
    const next = workspaceReducer(state, {
      type: 'UPDATE_OVERRIDES',
      overrides: { measureOptionId: 'exits' },
    });

    expect(next.overrides.measureOptionId).toEqual(state.overrides.measureOptionId);
    expect(warnSpy).toHaveBeenCalledWith('[analytics:v2] overrideDenied', {
      presetId: state.activePresetId,
      field: 'measureOptionId',
    });
  });

  it('clears custom overrides when switching presets twice', () => {
    const firstSelect = workspaceReducer(defaultState, {
      type: 'SELECT_PRESET',
      preset: presetWithOptions,
      overrides: { timeRangeId: '6h', splitEnabled: true },
    });
    const updated = workspaceReducer(firstSelect, {
      type: 'UPDATE_OVERRIDES',
      overrides: { timeRangeId: '24h' },
    });
    const secondSelect = workspaceReducer(updated, {
      type: 'SELECT_PRESET',
      preset: presetWithOptions,
      overrides: { timeRangeId: '6h', splitEnabled: true },
    });

    expect(secondSelect.overrides.timeRangeId).toBe('6h');
  });

  it('stores diagnostics on successful run', () => {
    const resultState = workspaceReducer(defaultState, {
      type: 'RUN_SUCCESS',
      payload: {
        result: {
          chartType: 'single_value',
          xDimension: { id: 'x', type: 'index' },
          series: [],
          meta: { timezone: 'UTC' },
        },
        spec: templateSpec,
        specHash: 'hash',
        diagnostics: { partialData: true },
      },
    });

    expect(resultState.diagnostics?.partialData).toBe(true);
    expect(resultState.error).toBeUndefined();
  });

  it('captures transport category when a run fails', () => {
    const failed = workspaceReducer(defaultState, {
      type: 'RUN_FAILURE',
      error: 'Network down',
      category: 'NETWORK',
    });

    expect(failed.errorCategory).toBe('NETWORK');
    expect(failed.isLoading).toBe(false);
  });

  it('yields a different spec hash when the time range override changes', () => {
    const anchor = new Date('2024-02-01T00:00:00Z');
    const initialSpec = buildSpecWithOverrides(presetWithOptions, defaultState.overrides, anchor);
    const updatedState = workspaceReducer(defaultState, {
      type: 'UPDATE_OVERRIDES',
      overrides: { timeRangeId: '24h' },
    });
    const nextSpec = buildSpecWithOverrides(presetWithOptions, updatedState.overrides, anchor);

    expect(nextSpec.timeWindow.from).not.toEqual(initialSpec.timeWindow.from);
    expect(hashChartSpec(nextSpec)).not.toEqual(hashChartSpec(initialSpec));
  });
});
