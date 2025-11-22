import type { ChartResult, ChartSeries, DataPoint } from "../../../analytics/schemas/charting";
import { VRM_KPI_IDS } from "./applyVRMOverrides";

const CAPACITY_BY_CLIENT: Record<string, number> = {
  client1: 10,
  client2: 100,
};

export const lookupCapacity = (orgId: string | undefined): number => {
  const capacity = orgId ? CAPACITY_BY_CLIENT[orgId] : undefined;
  if (capacity !== undefined) {
    return capacity;
  }
  // VRM capacity usage assumes a known site capacity; fall back to 10 to avoid
  // divide-by-zero while keeping the widget usable.
  // eslint-disable-next-line no-console
  console.warn("Unknown client for capacity usage, falling back to 10", { orgId });
  return 10;
};

export const cloneResult = (result: ChartResult): ChartResult =>
  JSON.parse(JSON.stringify(result)) as ChartResult;

const ensureSummary = (result: ChartResult) => {
  if (!result.meta) {
    result.meta = { timezone: "UTC" } as ChartResult["meta"];
  }
  result.meta.summary = result.meta.summary ?? {};
};

export const markCompact = (result: ChartResult) => {
  ensureSummary(result);
  result.meta.summary!.compact = 1 as unknown as string | number | null;
};

// VRM KPI band semantics:
// - All headline KPI values are taken from the latest 15-minute bucket within a 24h/15m
//   series (or the derived "now" occupancy point for capacity usage).
// - Sparklines and totals can use the full 24-hour series, but the main number is always
//   the most recent bucket.
export const lastBucketValue = (series?: ChartSeries): number | null => {
  if (!series || !series.data.length) {
    return null;
  }
  const lastPoint = series.data[series.data.length - 1];
  const value = lastPoint.value ?? lastPoint.y;
  return typeof value === "number" ? value : null;
};

const setHeadlineValue = (result: ChartResult, value: number | null) => {
  ensureSummary(result);
  result.meta.summary!.headlineValue = value ?? null;
};

const logVrmDebug = (widgetId: string, series?: ChartSeries, headline?: number | null) => {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  // eslint-disable-next-line no-console
  console.log("VRM KPI debug", {
    widgetId,
    headline,
    seriesPreview: series?.data?.map((point) => point.value ?? point.y) ?? [],
  });
};

const applyLastBucketHeadline = (widgetId: string, result: ChartResult) => {
  const series = result.series?.[0];
  const lastValue = lastBucketValue(series);
  setHeadlineValue(result, lastValue);
  logVrmDebug(widgetId, series, lastValue);
};

const addSummaryText = (result: ChartResult, key: string, value?: string) => {
  if (!value) {
    return;
  }
  ensureSummary(result);
  result.meta.summary![key] = value;
};

export const sumSeries = (series?: ChartSeries) => {
  if (!series) {
    return 0;
  }
  return series.data.reduce((total, point) => {
    const value = point.value ?? point.y ?? 0;
    return total + (typeof value === "number" ? value : 0);
  }, 0);
};

const getLastTwoValues = (series?: ChartSeries): { last: number | null; previous: number | null } => {
  if (!series || !series.data.length) {
    return { last: null, previous: null };
  }
  const lastPoint = series.data[series.data.length - 1];
  const previousPoint = series.data[series.data.length - 2];
  const last = (lastPoint?.value ?? lastPoint?.y ?? null) as number | null;
  const previous = (previousPoint?.value ?? previousPoint?.y ?? null) as number | null;
  return { last, previous };
};

const formatDeltaText = (value: number | null) => {
  if (value === null) {
    return undefined;
  }
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${sign}${Math.round(value)}`;
};

const getStartOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

export const getEntrancesHeadline = (result: ChartResult): number | null =>
  lastBucketValue(result.series?.[0]);

export const getExitsHeadline = (result: ChartResult): number | null =>
  lastBucketValue(result.series?.[0]);

export const getDwellHeadline = (result: ChartResult): number | null =>
  lastBucketValue(result.series?.[0]);

export const getOccupancyHeadline = (result: ChartResult): number | null =>
  lastBucketValue(result.series?.[0]);

export const getFootfallHeadline = (result: ChartResult): {
  lastBucket: number | null;
  total24h: number;
} => {
  const series = result.series?.[0];
  return { lastBucket: lastBucketValue(series), total24h: sumSeries(series) };
};

export const getCapacityUsageHeadline = (
  result: ChartResult,
  orgId: string | undefined,
): { currentUsage: number | null; peakToday: number } => {
  const series = result.series?.[0];
  const capacity = lookupCapacity(orgId);
  if (!series || !capacity) {
    return { currentUsage: null, peakToday: 0 };
  }
  const startOfDay = getStartOfToday();
  const { last } = getLastTwoValues(series);
  const occupancyPoints = [...series.data];
  const occupancyNow = typeof last === "number" ? last : null;
  const peakOccupancy = occupancyPoints.reduce((peak, point) => {
    const timestamp = point.x ? new Date(point.x) : null;
    const withinDay = timestamp ? timestamp >= startOfDay : true;
    const value = point.value ?? point.y ?? 0;
    if (!withinDay) {
      return peak;
    }
    return Math.max(peak, Number(value));
  }, 0);

  const currentUsage =
    typeof occupancyNow === "number" && capacity > 0 ? (occupancyNow / capacity) * 100 : null;
  const peakToday = capacity > 0 ? (peakOccupancy / capacity) * 100 : 0;

  return { currentUsage, peakToday };
};

export const buildTrafficPlaceholderResult = (): ChartResult => ({
  chartType: "single_value",
  xDimension: { id: "timestamp", type: "time", bucket: "15_MIN", timezone: "UTC" },
  series: [
    {
      id: "traffic_share",
      label: "Traffic distribution",
      geometry: "metric",
      unit: "percentage",
      data: [{ x: new Date().toISOString(), value: 100, y: 100 }],
    },
  ],
  meta: {
    summary: { headline: "Camera – 100% of events", compact: 1 as unknown as number },
    timezone: "UTC",
  },
});

export const applyTrafficDistributionShare = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  if (!series) {
    return buildTrafficPlaceholderResult();
  }
  const total = series.data.reduce((sum, point) => sum + Number(point.value ?? point.y ?? 0), 0);
  let topCamera = String(series.data[0]?.x ?? "Camera");
  let topShare = 0;
  series.data = series.data.map((point) => {
    const raw = point.value ?? point.y ?? 0;
    const share = total > 0 ? (Number(raw) / total) * 100 : 0;
    if (share >= topShare) {
      topShare = share;
      topCamera = String(point.x ?? "Camera");
    }
    return { ...point, value: share, y: share } as DataPoint;
  });
  setHeadlineValue(next, topShare);
  addSummaryText(next, "headline", `${topCamera} – ${Math.round(topShare)}% of events`);
  return next;
};

export const applyCapacityUsage = (result: ChartResult, orgId: string | undefined): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  const capacity = lookupCapacity(orgId);
  if (!series || !capacity) {
    return next;
  }

  const occupancyPoints = [...series.data];
  const { last, previous } = getLastTwoValues(series);
  const deltaOccupancy = typeof last === "number" && typeof previous === "number" ? last - previous : null;
  const occupancyNow = typeof last === "number" ? last : null;

  const startOfDay = getStartOfToday();

  const peakOccupancy = occupancyPoints.reduce((peak, point) => {
    const timestamp = point.x ? new Date(point.x) : null;
    const withinDay = timestamp ? timestamp >= startOfDay : true;
    const value = point.value ?? point.y ?? 0;
    if (!withinDay) {
      return peak;
    }
    return Math.max(peak, Number(value));
  }, 0);

  const currentUsage =
    typeof occupancyNow === "number" && capacity > 0 ? (occupancyNow / capacity) * 100 : null;
  const peakToday = capacity > 0 ? (peakOccupancy / capacity) * 100 : 0;

  const lastPoint = occupancyPoints[occupancyPoints.length - 1];
  const lastUsagePoint: DataPoint | undefined = lastPoint
    ? ({ x: lastPoint.x, value: currentUsage, y: currentUsage } as DataPoint)
    : undefined;

  series.unit = "percentage";
  series.label = "Capacity usage";
  series.data = lastUsagePoint ? [lastUsagePoint] : [];

  if (!next.meta.summary) {
    next.meta.summary = {};
  }

  next.meta.summary.capacity_usage_now = currentUsage;
  next.meta.summary.peak_capacity_usage_today = peakToday;
  next.meta.summary.occupancy_delta_15m = deltaOccupancy;

  const peakWithinDay = occupancyPoints
    .filter((point) => {
      const ts = point.x ? new Date(point.x) : null;
      return ts ? ts >= startOfDay : true;
    })
    .reduce((peak, point) => Math.max(peak, Number(point.value ?? point.y ?? 0)), 0);

  next.meta.summary.peak_occupancy_today = peakWithinDay;

  addSummaryText(next, "secondaryText", `Peak today: ${Math.round(peakToday)}%`);
  setHeadlineValue(next, currentUsage);
  logVrmDebug(VRM_KPI_IDS.capacity, series, currentUsage);
  return next;
};

export const applyFootfallTotal = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  const primary = next.series[0];
  const total = sumSeries(primary);
  const lastValue = lastBucketValue(primary);
  setHeadlineValue(next, lastValue);
  logVrmDebug(VRM_KPI_IDS.footfall, primary, lastValue);
  addSummaryText(next, "secondaryText", `24h total: ${Math.round(total)}`);
  return next;
};

export const applyOccupancyDelta = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  const { last, previous } = getLastTwoValues(series);
  const deltaText = formatDeltaText(
    typeof last === "number" && typeof previous === "number" ? last - previous : null,
  );
  setHeadlineValue(next, typeof last === "number" ? last : null);
  logVrmDebug(VRM_KPI_IDS.occupancy, series, typeof last === "number" ? last : null);
  addSummaryText(next, "secondaryText", deltaText ? `Δ vs 15m ago: ${deltaText}` : undefined);
  return next;
};

const applyBasicVrmHeadline = (widgetId: string, result: ChartResult) => {
  const next = cloneResult(result);
  markCompact(next);
  applyLastBucketHeadline(widgetId, next);
  return next;
};

export const decorateResult = (
  widgetId: string,
  result: ChartResult,
  orgId: string | undefined,
): ChartResult => {
  const fixedIds = new Set<string>(Object.values(VRM_KPI_IDS));
  if (!fixedIds.has(widgetId)) {
    return result;
  }
  markCompact(result);
  if (widgetId === VRM_KPI_IDS.traffic) {
    return applyTrafficDistributionShare(result);
  }
  if (widgetId === VRM_KPI_IDS.capacity) {
    return applyCapacityUsage(result, orgId);
  }
  if (widgetId === VRM_KPI_IDS.footfall) {
    return applyFootfallTotal(result);
  }
  if (widgetId === VRM_KPI_IDS.occupancy) {
    return applyOccupancyDelta(result);
  }
  if (widgetId === VRM_KPI_IDS.entrances || widgetId === VRM_KPI_IDS.exits || widgetId === VRM_KPI_IDS.dwell) {
    return applyBasicVrmHeadline(widgetId, result);
  }
  return result;
};

