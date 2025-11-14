import { runAnalyticsQuery } from './runAnalytics';
import { listPresets } from '../presets/presetCatalogue';
import { buildDefaultOverrides, buildSpecWithOverrides } from '../utils/specOverrides';
import type { PresetDefinition } from '../presets/types';
import type { ChartFixtureName } from '../../utils/loadChartFixture';

describe('runAnalyticsQuery transport guardrails', () => {
  const preset = listPresets()[0];
  let infoSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('surfaces aborted signals as ABORTED category', async () => {
    if (!preset) {
      throw new Error('Preset catalogue empty');
    }
    const overrides = buildDefaultOverrides(preset);
    const spec = buildSpecWithOverrides(preset, overrides, new Date('2024-02-01T00:00:00Z'));
    const controller = new AbortController();
    const promise = runAnalyticsQuery(preset, spec, 'fixtures', controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ category: 'ABORTED' });
  });

  it('flags missing fixtures as INVALID_RESULT', async () => {
    const invalidPreset: PresetDefinition = {
      ...preset,
      id: 'invalid_fixture',
      fixture: 'nonexistent_fixture' as ChartFixtureName,
      templateSpec: { ...preset.templateSpec },
    };
    const overrides = buildDefaultOverrides(invalidPreset);
    const spec = buildSpecWithOverrides(invalidPreset, overrides, new Date('2024-02-01T00:00:00Z'));
    await expect(runAnalyticsQuery(invalidPreset, spec, 'fixtures')).rejects.toMatchObject({
      category: 'INVALID_RESULT',
    });
  });
});
