import type {
  ChartResult,
  ChartSeries,
  ChartSpec,
  TimeBucket,
} from "../../../analytics/schemas/charting";
import type { DashboardTimeRangeOption, DashboardWidget } from "../types";

export type DemographicWidgetKind = "age" | "gender" | "hour" | "race";

const resolveTimeWindow = (
  timeRange: DashboardTimeRangeOption | null | undefined,
  timezone: string | undefined,
  anchor: Date,
  bucketOverride?: TimeBucket,
): ChartSpec["timeWindow"] => {
  const to = anchor.toISOString();
  const isAllTime = timeRange?.allTime ?? timeRange?.durationMinutes == null;
  const durationMinutes = timeRange?.durationMinutes ?? 0;
  const from = isAllTime
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
  hour: [{ id: "timestamp", column: "timestamp", bucket: "HOUR", sort: "asc" }],
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
  hour: {
    id: "site-flow-demographics-hour",
    title: "Site Flow Hourly Distribution",
    kind: "chart",
    chartSpecId: "dashboard.site_flow.demographics.hour",
    fixtureId: undefined,
    inlineSpec: {
      ...BASE_DEMOGRAPHIC_SPEC,
      id: "dashboard.site_flow.demographics.hour",
      measures: [
        {
          id: "events",
          aggregation: "count",
          label: "Events",
        },
      ],
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

export const isSiteFlowWidget = (widget: DashboardWidget): boolean =>
  widget.id === "live-flow" || widget.chartSpecId === "dashboard.live_flow";

export interface DemographicSlice {
  code: string | number | null;
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
  switch (normalized) {
    case 0:
      return "Male";
    case 1:
      return "Female";
    default:
      return "Unknown";
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
      return "Unknown";
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

const parseHour = (raw: unknown): number | null => {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw >= 0 && raw <= 23 ? raw : null;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && Number.isInteger(numeric) && numeric >= 0 && numeric <= 23) {
      return numeric;
    }

    // ISO-like timestamps or "YYYY-MM-DD HH:MM:SS"
    const timestampHourMatch = trimmed.match(/(?:T|\s)(\d{2}):\d{2}/);
    if (timestampHourMatch) {
      const parsedHour = Number(timestampHourMatch[1]);
      if (parsedHour >= 0 && parsedHour <= 23) {
        return parsedHour;
      }
    }

    // Plain time strings such as "05:00" or "05:00:00"
    const timeHourMatch = trimmed.match(/^(\d{1,2})(?::\d{2})/);
    if (timeHourMatch) {
      const parsedHour = Number(timeHourMatch[1]);
      if (Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23) {
        return parsedHour;
      }
    }
  }

  return null;
};

const mapHours = (result: ChartResult | undefined): HourSlice[] => {
  const series: ChartSeries | undefined = result?.series?.[0];
  if (!series) return [];
  const aggregated = new Map<number, number>();

  (series.data ?? []).forEach((point) => {
    const hour = parseHour(point.x as string | number);
    if (hour == null || hour < 0 || hour > 23) {
      return;
    }
    const count = toNumeric(point);
    const current = aggregated.get(hour) ?? 0;
    aggregated.set(hour, current + count);
  });

  return Array.from(aggregated.entries())
    .map(([hour, count]) => ({
      code: hour,
      hour,
      label: formatHourLabel(hour),
      count,
    }))
    .filter((slice) => slice.count > 0)
    .sort((a, b) => a.hour - b.hour);
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
