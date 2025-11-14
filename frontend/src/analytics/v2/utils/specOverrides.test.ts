import type { PresetDefinition } from '../presets/types';
import type { ChartSpec } from '../../schemas/charting';
import {
  buildDefaultOverrides,
  buildSpecWithOverrides,
  buildParameterBadges,
  shouldEnableSplit,
  overridesMatchDefaults,
} from './specOverrides';

const templateSpec: ChartSpec = {
  id: 'spec',
  dataset: 'events',
  measures: [
    { id: 'entries', label: 'Entries', aggregation: 'count' },
    { id: 'exits', label: 'Exits', aggregation: 'count' },
  ],
  dimensions: [{ id: 'timestamp', column: 'timestamp', bucket: 'HOUR', sort: 'asc' }],
  splits: [{ id: 'site_id', column: 'site_id', limit: 3 }],
  timeWindow: { from: '2024-01-01T00:00:00Z', to: '2024-01-07T00:00:00Z', bucket: 'HOUR', timezone: 'UTC' },
  chartType: 'composed_time',
  interactions: { zoom: true },
};

const preset: PresetDefinition = {
  id: 'test',
  title: 'Test',
  description: 'Testing preset',
  icon: 'activity',
  category: 'Engagement',
  fixture: 'golden_dashboard_live_flow',
  templateSpec,
  overrides: {
    timeRangeOptions: [
      { id: '24h', label: 'Last 24h', duration: { amount: 24, unit: 'hour' }, bucket: 'HOUR' },
      { id: '7d', label: 'Last 7d', duration: { amount: 7, unit: 'day' }, bucket: 'DAY' },
    ],
    defaultTimeRangeId: '24h',
    splitToggle: { dimensionId: 'site_id', label: 'Split by site', enabledByDefault: true },
    measureOptions: [
      { id: 'all', label: 'Entries vs Exits', measureIds: ['entries', 'exits'] },
      { id: 'entries', label: 'Entries only', measureIds: ['entries'] },
    ],
  },
};

describe('spec override utilities', () => {
  it('builds deterministic specs when using a fixed anchor', () => {
    const anchor = new Date('2024-02-01T00:00:00Z');
    const overrides = buildDefaultOverrides(preset);
    const first = buildSpecWithOverrides(preset, overrides, anchor);
    const second = buildSpecWithOverrides(preset, overrides, anchor);
    expect(first).toEqual(second);
  });

  it('produces badges aligned with selected overrides', () => {
    const overrides = { ...buildDefaultOverrides(preset), measureOptionId: 'entries' };
    const badges = buildParameterBadges(preset, overrides);
    expect(badges).toEqual(['Last 24h', 'Entries only', 'Split by site: On']);
  });

  it('detects default override states', () => {
    const defaults = buildDefaultOverrides(preset);
    expect(overridesMatchDefaults(preset, defaults)).toBe(true);
    expect(overridesMatchDefaults(preset, { ...defaults, splitEnabled: false })).toBe(false);
  });

  it('respects split toggles when disabled', () => {
    const overrides = { ...buildDefaultOverrides(preset), splitEnabled: false };
    expect(shouldEnableSplit(preset, overrides)).toBe(false);
  });
});
