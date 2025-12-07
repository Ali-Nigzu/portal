import type { ChartSpec } from "../../../analytics/schemas/charting";
import type { DashboardWidget } from "../types";

export type DemographicWidgetKind = "age" | "gender" | "hour";

const BASE_DEMOGRAPHIC_SPEC: Pick<ChartSpec, "dataset" | "chartType" | "timeWindow"> = {
  dataset: "events",
  chartType: "categorical",
  timeWindow: { from: "", to: "" },
};

const demographicDimension: Record<DemographicWidgetKind, ChartSpec["dimensions"]> = {
  age: [{ id: "age_bucket", column: "age_bucket", sort: "desc" }],
  gender: [{ id: "sex", column: "sex", sort: "desc" }],
  hour: [{ id: "timestamp", column: "timestamp", bucket: "HOUR", sort: "asc" }],
};

const DEMOGRAPHIC_WIDGET_BASE: Record<DemographicWidgetKind, DashboardWidget> = {
  age: {
    id: "site-flow-demographics-age",
    title: "Site Flow Age Demographics",
    kind: "chart",
    chartSpecId: "dashboard.site_flow.demographics.age",
    fixtureId: undefined,
    inlineSpec: {
      ...BASE_DEMOGRAPHIC_SPEC,
      id: "dashboard.site_flow.demographics.age",
      measures: [{ id: "events", aggregation: "count", label: "Events" }],
      dimensions: demographicDimension.age,
      interactions: { export: ["png", "csv"] },
    },
  },
  gender: {
    id: "site-flow-demographics-gender",
    title: "Site Flow Gender Demographics",
    kind: "chart",
    chartSpecId: "dashboard.site_flow.demographics.gender",
    fixtureId: undefined,
    inlineSpec: {
      ...BASE_DEMOGRAPHIC_SPEC,
      id: "dashboard.site_flow.demographics.gender",
      measures: [{ id: "events", aggregation: "count", label: "Events" }],
      dimensions: demographicDimension.gender,
      interactions: { export: ["png", "csv"] },
    },
  },
  hour: {
    id: "site-flow-demographics-hour",
    title: "Site Flow Hourly Distribution",
    kind: "chart",
    chartSpecId: "dashboard.site_flow.demographics.hour",
    fixtureId: undefined,
    inlineSpec: {
      ...BASE_DEMOGRAPHIC_SPEC,
      id: "dashboard.site_flow.demographics.hour",
      measures: [{ id: "events", aggregation: "count", label: "Events" }],
      dimensions: demographicDimension.hour,
      interactions: { export: ["png", "csv"] },
    },
  },
};

export const buildDemographicsWidget = (kind: DemographicWidgetKind): DashboardWidget => ({
  ...DEMOGRAPHIC_WIDGET_BASE[kind],
});

export const isSiteFlowWidget = (widget: DashboardWidget): boolean =>
  widget.id === "live-flow" || widget.chartSpecId === "dashboard.live_flow";

export interface DemographicSlice {
  label: string;
  value: number;
}

export interface SiteFlowDemographicsData {
  age: DemographicSlice[];
  gender: DemographicSlice[];
  race: DemographicSlice[];
  hour: DemographicSlice[];
}
