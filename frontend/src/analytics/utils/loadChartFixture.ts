import type { ChartResult } from "../schemas/charting";

const FIXTURE_MODULES: Record<string, () => Promise<ChartResult>> = {
  "golden_dashboard_live_flow": () =>
    import("../../../../shared/analytics/examples/golden_dashboard_live_flow.json").then(
      (module) => module.default as ChartResult
    ),
  "golden_dwell_by_camera": () =>
    import("../../../../shared/analytics/examples/golden_dwell_by_camera.json").then(
      (module) => module.default as ChartResult
    ),
  "golden_demographics_by_age": () =>
    import("../../../../shared/analytics/examples/golden_demographics_by_age.json").then(
      (module) => module.default as ChartResult
    ),
  "golden_retention_heatmap": () =>
    import("../../../../shared/analytics/examples/golden_retention_heatmap.json").then(
      (module) => module.default as ChartResult
    ),
  "chartresult_phase2_example": () =>
    import("../../../../shared/analytics/examples/chartresult_phase2_example.json").then(
      (module) => module.default as ChartResult
    ),
};

export type ChartFixtureName = keyof typeof FIXTURE_MODULES;

export async function loadChartFixture(name: ChartFixtureName): Promise<ChartResult> {
  const loader = FIXTURE_MODULES[name];
  if (!loader) {
    throw new Error(`Unknown fixture: ${name}`);
  }
  return loader();
}

export function listAvailableFixtures(): ChartFixtureName[] {
  return Object.keys(FIXTURE_MODULES) as ChartFixtureName[];
}
