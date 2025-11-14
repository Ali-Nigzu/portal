import type { ChartResult, ChartSpec } from '../../schemas/charting';
import type { PresetDefinition } from '../presets/types';
import type { WorkspaceOverrides } from '../state/workspaceStore';
import {
  hasSpecDrift,
  badgesMatchSpec,
  overridesAreDefault,
  legendVisibilityMatches,
} from './workspaceIntegrity';

const templateSpec: ChartSpec = {
  id: 'test',
  dataset: 'events',
  measures: [{ id: 'entries', label: 'Entries', aggregation: 'count' }],
  dimensions: [{ id: 'timestamp', column: 'timestamp', bucket: 'HOUR', sort: 'asc' }],
  timeWindow: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z', bucket: 'HOUR', timezone: 'UTC' },
  chartType: 'composed_time',
  interactions: { zoom: true },
};

const preset: PresetDefinition = {
  id: 'preset',
  title: 'Preset',
  description: 'Preset',
  icon: 'activity',
  category: 'Engagement',
  fixture: 'golden_dashboard_live_flow',
  templateSpec,
  overrides: {
    timeRangeOptions: [
      { id: '24h', label: 'Last 24h', duration: { amount: 24, unit: 'hour' }, bucket: 'HOUR' },
    ],
    splitToggle: { dimensionId: 'site_id', label: 'Split by site', enabledByDefault: true },
    measureOptions: [{ id: 'entries', label: 'Entries', measureIds: ['entries'] }],
  },
};

const defaultOverrides: WorkspaceOverrides = {
  timeRangeId: '24h',
  splitEnabled: true,
  measureOptionId: 'entries',
};

describe('workspace integrity helpers', () => {
  it('detects spec drift when overrides change without rerun', () => {
    const anchor = new Date('2024-02-01T00:00:00Z');
    const spec: ChartSpec = { ...templateSpec };
    expect(hasSpecDrift({ preset, overrides: defaultOverrides, spec, anchor })).toBe(true);
  });

  it('confirms badges mirror overrides', () => {
    expect(badgesMatchSpec(preset, defaultOverrides, ['Last 24h', 'Entries', 'Split by site: On'])).toBe(true);
    expect(badgesMatchSpec(preset, defaultOverrides, ['Last 7d'])).toBe(false);
  });

  it('reports when overrides equal defaults', () => {
    expect(overridesAreDefault(preset, defaultOverrides)).toBe(true);
    expect(overridesAreDefault(preset, { ...defaultOverrides, splitEnabled: false })).toBe(false);
  });

  it('ensures legend visibility map stays aligned', () => {
    const result: ChartResult = {
      chartType: 'composed_time',
      xDimension: { id: 'timestamp', type: 'time', bucket: 'HOUR', timezone: 'UTC' },
      series: [
        { id: 'a', label: 'A', geometry: 'line', unit: 'people', data: [{ x: '1', y: 1 }] },
      ],
      meta: { timezone: 'UTC' },
    };
    expect(legendVisibilityMatches(result, { a: true })).toBe(true);
    expect(legendVisibilityMatches(result, { b: true })).toBe(false);
  });
});
