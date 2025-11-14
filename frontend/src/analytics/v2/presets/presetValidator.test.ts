import type { PresetDefinition } from './types';
import { validatePresetDefinition } from './presetValidator';

describe('preset validator', () => {
  const basePreset: PresetDefinition = {
    id: 'valid',
    title: 'Valid',
    description: 'valid',
    icon: 'activity',
    category: 'Engagement',
    fixture: 'golden_dashboard_live_flow',
    templateSpec: {
      id: 'spec',
      dataset: 'events',
      measures: [
        { id: 'entries', label: 'Entries', aggregation: 'count' },
        { id: 'exits', label: 'Exits', aggregation: 'count' },
      ],
      dimensions: [{ id: 'timestamp', column: 'timestamp', bucket: 'HOUR', sort: 'asc' }],
      splits: [{ id: 'site_id', column: 'site_id', limit: 5 }],
      timeWindow: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z', bucket: 'HOUR', timezone: 'UTC' },
      chartType: 'composed_time',
      interactions: { zoom: true },
    },
    overrides: {
      measureOptions: [{ id: 'default', label: 'Default', measureIds: ['entries'] }],
      splitToggle: { dimensionId: 'site_id', label: 'Split by site', enabledByDefault: true },
    },
  };

  it('throws when measure option references unknown id', () => {
    const invalid: PresetDefinition = {
      ...basePreset,
      overrides: { ...basePreset.overrides, measureOptions: [{ id: 'bad', label: 'Bad', measureIds: ['missing'] }] },
    };
    expect(() => validatePresetDefinition(invalid)).toThrow('missing');
  });
});
