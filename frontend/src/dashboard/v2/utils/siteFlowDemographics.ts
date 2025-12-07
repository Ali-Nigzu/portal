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

const normalizeCode = (code: string | number): number | null => {
  if (typeof code === "number" && Number.isFinite(code)) return code;
  const parsed = Number(String(code).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const mapAgeLabel = (code: string | number): string => {
  const normalized = normalizeCode(code);
  switch (normalized) {
    case 0:
      return "0–4";
    case 1:
      return "5–13";
    case 2:
      return "14–25";
    case 3:
      return "26–45";
    case 4:
      return "46–65";
    case 5:
      return "66+";
    default:
      return String(code).trim() || "Unknown";
  }
};

export const mapGenderLabel = (code: string | number): string => {
  const normalized = normalizeCode(code);
  switch (normalized) {
    case 0:
      return "Male";
    case 1:
      return "Female";
    default:
      return String(code).trim() || "Unknown";
  }
};

export const mapRaceLabel = (code: string | number): string => {
  const normalized = normalizeCode(code);
  switch (normalized) {
    case 0:
      return "Light";
    case 1:
      return "Mix";
    case 2:
      return "Dark";
    default:
      return String(code).trim() || "Unknown";
  }
};

export const formatHourLabel = (hour: number): string => {
  const safeHour = Math.max(0, Math.min(23, Math.trunc(hour)));
  return `${String(safeHour).padStart(2, "0")}:00`;
};

const mapSeries = (
  result: ChartResult | undefined,
  kind: DemographicWidgetKind,
): DemographicSlice[] => {
  const series: ChartSeries | undefined = result?.series?.[0];
  if (!series) return [];
  return (series.data ?? [])
    .map((point) => {
      const raw = point.x ?? "";
      const baseLabel =
        kind === "age"
          ? mapAgeLabel(raw as string | number)
          : kind === "gender"
            ? mapGenderLabel(raw as string | number)
            : kind === "race"
              ? mapRaceLabel(raw as string | number)
              : String(raw);
      return {
        label: baseLabel,
        count: toNumeric(point),
      };
    })
    .filter((entry) => entry.label !== "");
};

const mapHours = (result: ChartResult | undefined): HourSlice[] => {
  const series: ChartSeries | undefined = result?.series?.[0];
  if (!series) return [];
  return (series.data ?? [])
    .map((point): HourSlice | null => {
      const count = toNumeric(point);
      const rawHour =
        typeof point.x === "number"
          ? point.x
          : Number(point.x ?? Number.NaN);
      const hourFromNumber = Number.isFinite(rawHour) ? Number(rawHour) : Number.NaN;
      const parsedFromDate =
        !Number.isFinite(hourFromNumber) && point.x != null
          ? new Date(String(point.x)).getHours()
          : Number.NaN;
      const hour = Number.isFinite(hourFromNumber) ? hourFromNumber : parsedFromDate;
      if (!Number.isFinite(hour)) return null;
      return {
        hour,
        count,
        label: formatHourLabel(hour),
      };
    })
    .filter((entry): entry is HourSlice =>
      Boolean(entry) && entry.count > 0 && entry.label !== "",
    );
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
