import type { DashboardManifest, DashboardWidget } from "../types";

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
  [VRM_KPI_IDS.traffic]: "Traffic Split",
  [VRM_KPI_IDS.capacity]: "Capacity",
};


const vrmWidgets: DashboardWidget[] = [
  {
    id: VRM_KPI_IDS.entrances,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.entrances],
    kind: "kpi",
    locked: true,
  },
  {
    id: VRM_KPI_IDS.occupancy,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.occupancy],
    kind: "kpi",
    locked: true,
  },
  {
    id: VRM_KPI_IDS.exits,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.exits],
    kind: "kpi",
    locked: true,
  },
  {
    id: VRM_KPI_IDS.footfall,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.footfall],
    kind: "kpi",
    locked: true,
  },
  {
    id: VRM_KPI_IDS.dwell,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.dwell],
    kind: "kpi",
    locked: true,
  },
  {
    id: VRM_KPI_IDS.traffic,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.traffic],
    kind: "kpi",
    locked: true,
  },
  {
    id: VRM_KPI_IDS.capacity,
    title: VRM_KPI_TITLES[VRM_KPI_IDS.capacity],
    kind: "kpi",
    locked: true,
  },
];

const KPI_ORDER = vrmWidgets.map((widget) => widget.id);

const maybeApplySiteFlow = (widget: DashboardWidget): DashboardWidget => {
  const isSiteFlow = widget.chartSpecId === "dashboard.live_flow" || widget.id === "live-flow";
  if (!isSiteFlow) {
    return widget;
  }

  const nextInlineSpec = widget.inlineSpec ?? null;
  const measures = nextInlineSpec?.measures ?? [];
  const updatedMeasures = measures
    .filter((measure) => measure.id !== "throughput")
    .map((measure) => {
      if (measure.id === "occupancy") {
        return {
          ...measure,
          id: "occupancy",
          options: { ...(measure.options ?? {}), vrmOccupancy: true, vrmOccupancyStats: true },
        };
      }
      return measure;
    });

  return {
    ...widget,
    title: "Site Flow",
    chartSpecId: widget.chartSpecId === "dashboard.live_flow" ? widget.chartSpecId : widget.chartSpecId,
    inlineSpec: nextInlineSpec
      ? { ...nextInlineSpec, measures: updatedMeasures, displayHints: { ...nextInlineSpec.displayHints } }
      : widget.inlineSpec,
  };
};

const filterOutOldKpis = (manifest: DashboardManifest) => {
  const priorKpiIds = new Set(manifest.layout?.kpiBand ?? []);
  return manifest.widgets.filter((widget) => !priorKpiIds.has(widget.id));
};

export function applyVRMOverrides(
  manifest: DashboardManifest,
): DashboardManifest {
  const filteredWidgets = filterOutOldKpis(manifest).map(maybeApplySiteFlow);
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
