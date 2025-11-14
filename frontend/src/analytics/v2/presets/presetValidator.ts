import type { PresetDefinition } from './types';

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const validatePresetDefinition = (preset: PresetDefinition): void => {
  const templateMeasureIds = new Set(preset.templateSpec.measures.map((measure) => measure.id));
  const templateSplitIds = new Set((preset.templateSpec.splits ?? []).map((split) => split.id));

  preset.overrides.measureOptions?.forEach((option) => {
    option.measureIds.forEach((measureId) => {
      assert(templateMeasureIds.has(measureId), `${preset.id} references unknown measure ${measureId}`);
    });
  });

  if (preset.overrides.splitToggle) {
    assert(
      templateSplitIds.has(preset.overrides.splitToggle.dimensionId),
      `${preset.id} split toggle dimension ${preset.overrides.splitToggle.dimensionId} not found in template`,
    );
  }

  if (preset.fixture) {
    assert(preset.fixture.length > 0, `${preset.id} fixture name is empty`);
  }
};

export const validatePresetCatalogue = (presets: PresetDefinition[]): PresetDefinition[] => {
  presets.forEach((preset) => validatePresetDefinition(preset));
  return presets;
};
