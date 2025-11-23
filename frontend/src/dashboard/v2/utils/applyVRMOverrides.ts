import type { ChartSpec } from "../../../analytics/schemas/charting";
import type { DashboardManifest, DashboardWidget } from "../types";

const HOURS_24 = 24 * 60;

export const VRM_KPI_IDS = {
  entrances: "kpi-vrm-entrances",
  occupancy: "kpi-vrm-occupancy",
  exits: "kpi-vrm-exits",
  footfall: "kpi-vrm-footfall",
  dwell: "kpi-vrm-dwell",
  traffic: "kpi-vrm-traffic",
  capacity: "kpi-vrm-capacity",
} as const;

export const VRM_KPI_TITLES: Record<string, string> = {
  [VRM_KPI_IDS.entrances]: "Entrances",
  [VRM_KPI_IDS.occupancy]: "Occupancy",
  [VRM_KPI_IDS.exits]: "Exits",
  [VRM_KPI_IDS.footfall]: "Footfall",
  [VRM_KPI_IDS.dwell]: "Dwell Time",
  [VRM_KPI_IDS.traffic]: "Traffic by Camera",
  [VRM_KPI_IDS.capacity]: "Capacity Usage",
};

const fixedWindow = {
  bucket: "15_MIN" as const,
  durationMinutes: HOURS_24,
};

const timestampDimension = {
  bucket: "15_MIN" as const,
  column: "timestamp",
  id: "timestamp",
  sort: "asc" as const,
};

const baseTimeWindow = {
  bucket: "15_MIN" as const,
  from: "{{NOW_MINUS_24_HOURS}}",
  to: "{{NOW}}",
  timezone: "UTC",
};

type SingleValueOverrides = Partial<
  Omit<ChartSpec, "id" | "dataset" | "dimensions" | "timeWindow" | "chartType" | "measures">
> & {
  id: string;
  measures: ChartSpec["measures"];
  notes?: string[];
};

const singleValueSpec = ({ id, measures, notes, ...overrides }: SingleValueOverrides): ChartSpec => ({
  chartType: "single_value",
  dataset: "events",
  dimensions: [timestampDimension],
  displayHints: { carryForward: true },
  interactions: { export: ["png", "csv"] },
  timeWindow: baseTimeWindow,
  id,
  measures,
  notes,
  ...overrides,
});

const vrmWidgets: DashboardWidget[] = [
  {
    id: VRM_KPI_IDS.entrances,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.entrances],
    kind: "kpi",
    locked: true,
    chartSpecId: "dashboard.kpi.vrm.entrances",
    fixtureId: "golden_dashboard_kpi_entrances",
    inlineSpec: singleValueSpec({
      id: "dashboard.kpi.vrm.entrances",
      measures: [
        { aggregation: "count", id: "entrances", label: "Entrances", eventTypes: [1] },
      ],
      notes: ["Entrances every 15 minutes"],
    }),
    fixedTimeWindow: fixedWindow,
  },
  {
    id: VRM_KPI_IDS.occupancy,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.occupancy],
    kind: "kpi",
    locked: true,
    chartSpecId: "dashboard.kpi.vrm.occupancy",
    fixtureId: "golden_dashboard_kpi_live_occupancy",
    inlineSpec: singleValueSpec({
      id: "dashboard.kpi.vrm.occupancy",
      measures: [
        {
          aggregation: "occupancy_recursion",
          id: "occupancy",
          label: "Occupancy",
          options: { vrmOccupancy: true },
        },
      ],
      notes: ["Occupancy per 15 minutes"],
    }),
    fixedTimeWindow: fixedWindow,
  },
  {
    id: VRM_KPI_IDS.exits,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.exits],
    kind: "kpi",
    locked: true,
    chartSpecId: "dashboard.kpi.vrm.exits",
    fixtureId: "golden_dashboard_kpi_exits",
    inlineSpec: singleValueSpec({
      id: "dashboard.kpi.vrm.exits",
      measures: [{ aggregation: "count", id: "exits", label: "Exits", eventTypes: [0] }],
      notes: ["Exits every 15 minutes"],
    }),
    fixedTimeWindow: fixedWindow,
  },
  {
    id: VRM_KPI_IDS.footfall,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.footfall],
    kind: "kpi",
    locked: true,
    chartSpecId: "dashboard.kpi.vrm.footfall",
    fixtureId: "golden_dashboard_kpi_activity",
    inlineSpec: singleValueSpec({
      id: "dashboard.kpi.vrm.footfall",
      measures: [
        { aggregation: "count", id: "footfall", label: "Footfall", eventTypes: [0, 1] },
      ],
      notes: ["Footfall (entrances + exits) every 15 minutes"],
    }),
    fixedTimeWindow: fixedWindow,
  },
  {
    id: VRM_KPI_IDS.dwell,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.dwell],
    kind: "kpi",
    locked: true,
    chartSpecId: "dashboard.kpi.vrm.dwell",
    fixtureId: "golden_dashboard_kpi_average_dwell_time",
    inlineSpec: singleValueSpec({
      id: "dashboard.kpi.vrm.dwell",
      measures: [
        {
          aggregation: "dwell_mean",
          id: "dwell",
          label: "Avg dwell",
          options: { vrmDwellFifo: true },
        },
      ],
      notes: ["Average dwell by 15-minute bucket"],
    }),
    fixedTimeWindow: fixedWindow,
  },
  {
    id: VRM_KPI_IDS.traffic,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.traffic],
    kind: "kpi",
    locked: true,
    chartSpecId: "dashboard.kpi.vrm.traffic_distribution",
    fixtureId: "golden_dashboard_kpi_traffic_distribution",
    inlineSpec: {
      chartType: "composed_time",
      dataset: "events",
      dimensions: [timestampDimension],
      splits: [{ column: "camera_id", id: "camera_id", sort: "desc" }],
      displayHints: { carryForward: true },
      id: "dashboard.kpi.vrm.traffic_distribution",
      interactions: { export: ["png", "csv"] },
      measures: [{ aggregation: "count", id: "events", label: "Events" }],
      notes: ["Distribution of events by camera"],
      timeWindow: baseTimeWindow,
    },
    fixedTimeWindow: fixedWindow,
  },
  {
    id: VRM_KPI_IDS.capacity,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.capacity],
    kind: "kpi",
    locked: true,
    chartSpecId: "dashboard.kpi.vrm.capacity_usage",
    fixtureId: "golden_dashboard_kpi_live_occupancy",
    inlineSpec: singleValueSpec({
      id: "dashboard.kpi.vrm.capacity_usage",
      measures: [
        {
          aggregation: "occupancy_recursion",
          id: "occupancy",
          label: "Occupancy",
          options: { vrmOccupancy: true },
        },
      ],
      notes: ["Capacity usage derived from occupancy"],
    }),
    fixedTimeWindow: fixedWindow,
  },
];

const KPI_ORDER = vrmWidgets.map((widget) => widget.id);

const filterOutOldKpis = (manifest: DashboardManifest) => {
  const priorKpiIds = new Set(manifest.layout?.kpiBand ?? []);
  return manifest.widgets.filter((widget) => !priorKpiIds.has(widget.id));
};

export function applyVRMOverrides(
  manifest: DashboardManifest,
): DashboardManifest {
  const filteredWidgets = filterOutOldKpis(manifest);
  const nextWidgets = [...filteredWidgets, ...vrmWidgets];

  return {
    ...manifest,
    widgets: nextWidgets,
    layout: {
      ...manifest.layout,
      kpiBand: KPI_ORDER,
    },
  };
}

export type VRMOverrides = ReturnType<typeof applyVRMOverrides>;
