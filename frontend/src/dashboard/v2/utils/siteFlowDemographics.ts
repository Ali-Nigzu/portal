import type { ChartResult, ChartSeries, ChartSpec, TimeBucket, TimeWindow } from "../../../analytics/schemas/charting";
import type { DashboardTimeRangeOption, DashboardWidget } from "../types";

// DEBUG MAP (temporary)
// - Demographics widgets/specs: frontend/src/dashboard/v2/utils/siteFlowDemographics.ts
// - Demographics compiler path: backend/app/analytics/compiler.py:_render_demographic_count
// - Time window handling: backend/app/analytics/compiler.py:_resolve_time_params
// - Live Flow spec for comparison: backend/app/analytics/dashboard_catalogue.py:~190

export type DemographicWidgetKind = "age" | "gender" | "race";

const resolveTimeWindow = (
  timeRange: DashboardTimeRangeOption | null | undefined,
  timezone: string | undefined,
  anchor: Date,
  bucketOverride?: TimeBucket,
): ChartSpec["timeWindow"] => {
  const to = anchor.toISOString();
  const isAllTime = timeRange?.allTime ?? timeRange?.durationMinutes == null;
  const durationMinutes = isAllTime
    ? null
    : Math.max(timeRange?.durationMinutes ?? 0, 0);
  const from =
    durationMinutes == null
      ? new Date(0).toISOString()
      : new Date(anchor.getTime() - durationMinutes * 60_000).toISOString();

  const timeWindow: ChartSpec["timeWindow"] = { from, to };
  const bucket = bucketOverride ?? timeRange?.bucket;
  if (bucket) {
    timeWindow.bucket = bucket;
  }
  if (timezone) {
    timeWindow.timezone = timezone;
  }
  return timeWindow;
};

const DEFAULT_DEMOGRAPHIC_TIME_WINDOW = resolveTimeWindow(null, undefined, new Date());

const BASE_DEMOGRAPHIC_SPEC: Pick<ChartSpec, "dataset" | "chartType" | "timeWindow"> = {
  dataset: "events",
  chartType: "categorical",
  timeWindow: DEFAULT_DEMOGRAPHIC_TIME_WINDOW,
};

const demographicDimension: Record<DemographicWidgetKind, ChartSpec["dimensions"]> = {
  age: [{ id: "age_bucket", column: "age_bucket", sort: "desc" }],
  gender: [{ id: "sex", column: "sex", sort: "desc" }],
  // Use the scoped, mapped race label column (lowercase) to align with backend CTE output.
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
      measures: [
        {
          id: "events",
          aggregation: "count",
          label: "Events",
        },
      ],
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
      measures: [
        {
          id: "events",
          aggregation: "count",
          label: "Events",
        },
      ],
      dimensions: demographicDimension.gender,
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
      measures: [
        {
          id: "events",
          aggregation: "count",
          label: "Events",
        },
      ],
      dimensions: demographicDimension.race,
      interactions: { export: ["png", "csv"] },
    },
  },
};

export const buildDemographicsWidget = (
  kind: DemographicWidgetKind,
  timeWindow: ChartSpec["timeWindow"],
): DashboardWidget => {
  const base = DEMOGRAPHIC_WIDGET_BASE[kind];
  return {
    ...base,
    inlineSpec: {
      ...(base.inlineSpec as ChartSpec),
      timeWindow: { ...timeWindow },
    },
  };
};

export const resolveDemographicsTimeWindow = (
  timeRange: DashboardTimeRangeOption | null | undefined,
  timezone: string | undefined,
  anchor: Date = new Date(),
  bucketOverride?: TimeBucket,
): ChartSpec["timeWindow"] => resolveTimeWindow(timeRange, timezone, anchor, bucketOverride);

export const resolveDemographicsTimeWindowFromRange = (
  range: Pick<TimeWindow, "from" | "to">,
  timezone: string | undefined,
): ChartSpec["timeWindow"] => ({
  from: range.from,
  to: range.to,
  ...(timezone ? { timezone } : {}),
});

export const isSiteFlowWidget = (widget: DashboardWidget): boolean =>
  widget.id === "live-flow" || widget.chartSpecId === "dashboard.live_flow";

export interface DemographicSlice {
  code: string | number | null;
  label: string;
  count: number;
}

export interface SiteFlowDemographicsData {
  age: DemographicSlice[];
  gender: DemographicSlice[];
  race: DemographicSlice[];
  timezone: string;
}

export interface DemographicChartResults {
  age?: ChartResult;
  gender?: ChartResult;
  race?: ChartResult;
  timezone?: string | null;
}

const toNumeric = (point: { value?: number | null; y?: number | null }): number => {
  const raw = point.value ?? point.y ?? null;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
};

const AGE_LABELS = new Set(["0–4", "5–13", "14–25", "26–45", "46–65", "66+", "Unknown"]);
const GENDER_LABELS = new Set(["Male", "Female", "Unknown"]);
const RACE_LABELS = new Set(["Light", "Mix", "Dark", "Unknown"]);

const normalizeCode = (code: string | number): number | null => {
  if (typeof code === "number" && Number.isFinite(code)) {
    return Math.trunc(code);
  }

  if (typeof code === "string") {
    const trimmed = code.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }
  }

  return null;
};

const ensureAllowedLabel = (kind: DemographicWidgetKind, label: string): string => {
  if (kind === "age") {
    return AGE_LABELS.has(label) ? label : "Unknown";
  }
  if (kind === "gender") {
    return GENDER_LABELS.has(label) ? label : "Unknown";
  }
  if (kind === "race") {
    return RACE_LABELS.has(label) ? label : "Unknown";
  }
  return label;
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
      return "Unknown";
  }
};

export const mapGenderLabel = (code: string | number): string => {
  const normalized = normalizeCode(code);
  if (normalized === 0) return "Male";
  if (normalized === 1) return "Female";

  if (typeof code === "string") {
    const lowered = code.trim().toLowerCase();
    if (lowered === "male" || lowered === "m") return "Male";
    if (lowered === "female" || lowered === "f") return "Female";
  }

  return "Unknown";
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
      return "Unknown";
  }
};

const mapSeries = (
  result: ChartResult | undefined,
  kind: DemographicWidgetKind,
): DemographicSlice[] => {
  const series: ChartSeries | undefined = result?.series?.[0];
  if (!series) return [];
  const aggregated = new Map<string, { count: number; code: string | number | null }>();

  (series.data ?? []).forEach((point) => {
    const raw = point.x ?? "";
    const mappedLabel =
      kind === "age"
        ? mapAgeLabel(raw as string | number)
        : kind === "gender"
          ? mapGenderLabel(raw as string | number)
          : kind === "race"
            ? mapRaceLabel(raw as string | number)
            : "Unknown";
    const baseLabel = ensureAllowedLabel(kind, mappedLabel);
    const nextCount = toNumeric(point);
    if (baseLabel === "" || nextCount <= 0) {
      return;
    }
    const existing = aggregated.get(baseLabel);
    const currentCount = existing?.count ?? 0;
    const currentCode = existing?.code ?? null;
    const nextCode = currentCode ?? (raw as string | number | null);
    aggregated.set(baseLabel, { count: currentCount + nextCount, code: nextCode });
  });

  return Array.from(aggregated.entries()).map(([label, { count, code }]) => ({
    label,
    count,
    code,
  }));
};

export const mapChartResultsToDemographics = (
  results: DemographicChartResults,
): SiteFlowDemographicsData => {
  const resolvedTimezone =
    results.timezone ??
    results.age?.meta?.timezone ??
    results.gender?.meta?.timezone ??
    results.race?.meta?.timezone ??
    "UTC";

  return {
    age: mapSeries(results.age, "age"),
    gender: mapSeries(results.gender, "gender"),
    race: mapSeries(results.race, "race"),
    timezone: resolvedTimezone,
  };
};
