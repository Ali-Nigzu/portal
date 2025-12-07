import type { ChartResult, ChartSeries, ChartSpec } from "../../../analytics/schemas/charting";
import type { DashboardWidget } from "../types";

export type DemographicWidgetKind = "age" | "gender" | "hour" | "race";

const BASE_DEMOGRAPHIC_SPEC: Pick<ChartSpec, "dataset" | "chartType" | "timeWindow"> = {
  dataset: "events",
  chartType: "categorical",
  timeWindow: { from: "", to: "" },
};

const demographicDimension: Record<DemographicWidgetKind, ChartSpec["dimensions"]> = {
  age: [{ id: "age_bucket", column: "age_bucket", sort: "desc" }],
  gender: [{ id: "sex", column: "sex", sort: "desc" }],
  hour: [{ id: "timestamp", column: "timestamp", bucket: "HOUR", sort: "asc" }],
  race: [{ id: "race", column: "race", sort: "desc" }],
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
      measures: [{ id: "events", aggregation: "demographic_count", label: "Events" }],
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
      measures: [{ id: "events", aggregation: "demographic_count", label: "Events" }],
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
      measures: [{ id: "events", aggregation: "demographic_count", label: "Events" }],
      dimensions: demographicDimension.hour,
      interactions: { export: ["png", "csv"] },
    },
  },
  race: {
    id: "site-flow-demographics-race",
    title: "Site Flow Race Demographics",
    kind: "chart",
    chartSpecId: "dashboard.site_flow.demographics.race",
    fixtureId: undefined,
    inlineSpec: {
      ...BASE_DEMOGRAPHIC_SPEC,
      id: "dashboard.site_flow.demographics.race",
      measures: [{ id: "events", aggregation: "demographic_count", label: "Events" }],
      dimensions: demographicDimension.race,
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
  count: number;
}

export interface HourSlice extends DemographicSlice {
  hour: number;
}

export interface SiteFlowDemographicsData {
  age: DemographicSlice[];
  gender: DemographicSlice[];
  race: DemographicSlice[];
  hour: HourSlice[];
  timezone: string;
}

export interface DemographicChartResults {
  age?: ChartResult;
  gender?: ChartResult;
  race?: ChartResult;
  hour?: ChartResult;
  timezone?: string | null;
}

const toNumeric = (point: { value?: number | null; y?: number | null }): number => {
  const raw = point.value ?? point.y ?? null;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
};

const toLabel = (raw: string, kind: DemographicWidgetKind): string => {
  const normalized = raw.trim();
  if (kind === "age") {
    const ageMap: Record<string, string> = {
      "0": "0–4",
      "0-4": "0–4",
      "1": "5–13",
      "5-13": "5–13",
      "2": "14–25",
      "14-25": "14–25",
      "3": "26–45",
      "26-45": "26–45",
      "4": "46–65",
      "46-65": "46–65",
      "5": "66+",
      "66+": "66+",
    };
    return ageMap[normalized] ?? normalized;
  }
  if (kind === "gender") {
    const genderMap: Record<string, string> = {
      "0": "Male",
      "Male": "Male",
      "1": "Female",
      "Female": "Female",
    };
    return genderMap[normalized] ?? normalized;
  }
  if (kind === "race") {
    const raceMap: Record<string, string> = {
      "0": "Light",
      "Light": "Light",
      "1": "Mix",
      "Mix": "Mix",
      "2": "Dark",
      "Dark": "Dark",
    };
    return raceMap[normalized] ?? normalized;
  }
  return normalized;
};

const mapSeries = (
  result: ChartResult | undefined,
  kind: DemographicWidgetKind,
): DemographicSlice[] => {
  const series: ChartSeries | undefined = result?.series?.[0];
  if (!series) return [];
  return (series.data ?? [])
    .map((point) => ({
      label: toLabel(String(point.x ?? ""), kind),
      count: toNumeric(point),
    }))
    .filter((entry) => entry.label !== "");
};

const mapHours = (result: ChartResult | undefined): HourSlice[] => {
  const series: ChartSeries | undefined = result?.series?.[0];
  if (!series) return [];
  return (series.data ?? [])
    .map((point) => {
      const count = toNumeric(point);
      const rawHour = typeof point.x === "number" ? point.x : Number(point.x ?? null);
      const hour = Number.isFinite(rawHour) ? Number(rawHour) : NaN;
      return {
        hour,
        count,
        label: Number.isFinite(hour) ? `${String(hour).padStart(2, "0")}:00` : String(point.x ?? ""),
      };
    })
    .filter((entry) => entry.count > 0 && entry.label !== "" && Number.isFinite(entry.hour));
};

export const mapChartResultsToDemographics = (
  results: DemographicChartResults,
): SiteFlowDemographicsData => {
  const resolvedTimezone =
    results.age?.meta?.timezone ??
    results.gender?.meta?.timezone ??
    results.hour?.meta?.timezone ??
    results.race?.meta?.timezone ??
    results.timezone ??
    "UTC";

  return {
    age: mapSeries(results.age, "age"),
    gender: mapSeries(results.gender, "gender"),
    race: mapSeries(results.race, "race"),
    hour: mapHours(results.hour),
    timezone: resolvedTimezone,
  };
};
