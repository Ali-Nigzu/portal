import { loadChartFixture } from '../../utils/loadChartFixture';
import { listPresets } from '../presets/presetCatalogue';
import { buildDefaultOverrides, buildSpecWithOverrides } from '../utils/specOverrides';
import { validateChartResult } from '../../components/ChartRenderer/validation';

const TEST_ANCHOR = new Date('2024-02-01T00:00:00Z');

describe('Analytics presets round-trip', () => {
  it('loads fixtures and validates ChartRenderer contract', async () => {
    const presets = listPresets();
    await Promise.all(
      presets.map(async (preset) => {
        const overrides = buildDefaultOverrides(preset);
        const spec = buildSpecWithOverrides(preset, overrides, TEST_ANCHOR);
        expect(spec).toBeDefined();
        if (!preset.fixture) {
          throw new Error(`Preset ${preset.id} missing fixture`);
        }
        const result = await loadChartFixture(preset.fixture);
        const issues = validateChartResult(result);
        const passesContract =
          preset.templateSpec.chartType === 'retention'
            ? issues.every((issue) => issue.code === 'heatmap_grid_gap')
            : issues.length === 0;
        expect(passesContract).toBe(true);
      }),
    );
  });
});
