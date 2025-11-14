import type { ChartResult } from "../schemas/charting";

const FIXTURE_MODULES: Record<string, () => Promise<ChartResult>> = {
  "golden_dashboard_live_flow": () =>
    import("../examples/golden_dashboard_live_flow.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_dashboard_kpi_activity": () =>
    import("../examples/golden_dashboard_kpi_activity.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_dashboard_kpi_entrances": () =>
    import("../examples/golden_dashboard_kpi_entrances.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_dashboard_kpi_exits": () =>
    import("../examples/golden_dashboard_kpi_exits.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_dashboard_kpi_live_occupancy": () =>
    import("../examples/golden_dashboard_kpi_live_occupancy.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_dashboard_kpi_avg_dwell": () =>
    import("../examples/golden_dashboard_kpi_avg_dwell.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_dashboard_kpi_freshness": () =>
    import("../examples/golden_dashboard_kpi_freshness.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_dwell_by_camera": () =>
    import("../examples/golden_dwell_by_camera.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_demographics_by_age": () =>
    import("../examples/golden_demographics_by_age.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "golden_retention_heatmap": () =>
    import("../examples/golden_retention_heatmap.json").then(
      (module) => module.default as unknown as ChartResult
    ),
  "chartresult_phase2_example": () =>
    import("../examples/chartresult_phase2_example.json").then(
      (module) => module.default as unknown as ChartResult
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
