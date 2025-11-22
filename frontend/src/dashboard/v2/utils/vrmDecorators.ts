import type { ChartResult, ChartSeries, DataPoint } from "../../../analytics/schemas/charting";
import { VRM_KPI_IDS } from "./applyVRMOverrides";

const CAPACITY_BY_CLIENT: Record<string, number> = {
  client1: 10,
  client2: 100,
};

const TABLE_TO_UI_CLIENT: Record<string, string> = {
  client0: "client1",
  client1: "client2",
};

const normalizeOrgId = (orgId: string | undefined) => orgId?.replace(/_compat$/, "").toLowerCase();

export const resolveUiClient = (orgId: string | undefined): string | undefined => {
  const normalized = normalizeOrgId(orgId);
  if (!normalized) {
    return undefined;
  }
  const mapped = TABLE_TO_UI_CLIENT[normalized] ?? normalized;
  if (CAPACITY_BY_CLIENT[mapped] !== undefined) {
    return mapped;
  }
  return undefined;
};

export const lookupCapacity = (orgId: string | undefined): number => {
  const uiClient = resolveUiClient(orgId);
  const capacity = uiClient ? CAPACITY_BY_CLIENT[uiClient] : undefined;
  if (capacity === undefined) {
    // eslint-disable-next-line no-console
    console.error("VRM capacity usage: unknown client", { orgId, uiClientCandidate: uiClient });
    throw new Error(`Unknown client for capacity usage: ${orgId ?? "<none>"}`);
  }
  return capacity;
};

export const cloneResult = (result: ChartResult): ChartResult =>
  JSON.parse(JSON.stringify(result)) as ChartResult;

const ensureSummary = (result: ChartResult) => {
  if (!result.meta) {
    result.meta = { timezone: "UTC" } as ChartResult["meta"];
  }
  result.meta.summary = result.meta.summary ?? {};
};

const suppressDelta = (result: ChartResult) => {
  ensureSummary(result);
  result.meta.summary!.hideDelta = 1 as unknown as string | number | null;
};

export const markCompact = (result: ChartResult) => {
  ensureSummary(result);
  result.meta.summary!.presentation = "vrm";
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
  chartType: "categorical",
  xDimension: { id: "camera", type: "category" },
  series: [
    {
      id: "traffic_share",
      label: "Traffic by Camera",
      geometry: "bar",
      unit: "percentage",
      data: [{ x: "Camera", value: 100, y: 100 }],
    },
  ],
  meta: {
    summary: {
      headline: "Camera – 100%",
      presentation: "vrm",
      compact: 1 as unknown as number,
      hideDelta: 1 as unknown as number,
      chartStyle: "traffic_distribution",
      chartSubType: "traffic_distribution",
      title: "Traffic by Camera",
    },
    timezone: "UTC",
  },
});

const getLatestTimestamp = (seriesList: ChartSeries[]): string | null => {
  let latest: string | null = null;
  seriesList.forEach((series) => {
    const lastPoint = series.data[series.data.length - 1];
    if (lastPoint?.x && (!latest || new Date(lastPoint.x) > new Date(latest))) {
      latest = lastPoint.x;
    }
  });
  return latest;
};

const deriveCameraLabel = (series: ChartSeries, index: number): string => {
  const labelCandidate = series.label && series.label.toLowerCase() !== "events" ? series.label : null;
  const source = labelCandidate ?? series.id ?? `Camera ${index + 1}`;
  const normalized = String(source).trim();
  const tokens = normalized.split(/\||:|=/);
  const lastToken = tokens[tokens.length - 1]?.trim();
  const cleaned = lastToken?.replace(/camera[_\s-]?id[:\s-]*/i, "").replace(/^cam\s*/i, "").trim();
  return (cleaned && cleaned.length > 0 ? cleaned : lastToken) || `Camera ${index + 1}`;
};

export const applyTrafficDistributionShare = (result: ChartResult): ChartResult => {
  const trafficDistributionResult = cloneResult(result);
  markCompact(trafficDistributionResult);
  suppressDelta(trafficDistributionResult);
  ensureSummary(trafficDistributionResult);
  const seriesList = trafficDistributionResult.series ?? [];
  if (seriesList.length === 0) {
    return buildTrafficPlaceholderResult();
  }

  const hasTimestampBuckets = seriesList.some((series) =>
    series.data.some((point) => {
      if (!point?.x) {
        return false;
      }
      const parsed = new Date(point.x as string | number);
      return !Number.isNaN(parsed.valueOf());
    }),
  );

  const latestTimestamp = hasTimestampBuckets ? getLatestTimestamp(seriesList) : null;

  if (hasTimestampBuckets && !latestTimestamp) {
    return buildTrafficPlaceholderResult();
  }

  const cameraShares = hasTimestampBuckets
    ? seriesList.map((series, index) => {
        const latestPoint =
          series.data.find((point) => point.x === latestTimestamp) ?? series.data[series.data.length - 1];
        const raw = latestPoint?.value ?? latestPoint?.y ?? 0;
        const camera = deriveCameraLabel(series, index);
        return { camera, value: Number(raw) };
      })
    : seriesList[0].data.map((point, index) => ({
        camera: String(point.x ?? seriesList[0].label ?? `Camera ${index + 1}`),
        value: Number(point.value ?? point.y ?? 0),
      }));

  const total = cameraShares.reduce((sum, { value }) => sum + value, 0);
  let topCamera = cameraShares[0]?.camera ?? "Camera";
  let topShare = 0;

  const shareData: DataPoint[] = cameraShares.map(({ camera, value }) => {
    const share = total > 0 ? (value / total) * 100 : 0;
    if (share >= topShare) {
      topShare = share;
      topCamera = camera;
    }
    return { x: camera, value: share, y: share } as DataPoint;
  });

  trafficDistributionResult.chartType = "categorical";
  trafficDistributionResult.xDimension = { id: "camera", type: "category" } as ChartResult["xDimension"];
  trafficDistributionResult.series = [
    {
      id: "traffic_share",
      label: "Traffic by Camera",
      geometry: "bar",
      unit: "percentage",
      data: shareData,
    },
  ];
  setHeadlineValue(trafficDistributionResult, topShare);
  addSummaryText(trafficDistributionResult, "headline", `${topCamera} – ${Math.round(topShare)}%`);
  addSummaryText(trafficDistributionResult, "chartSubType", "traffic_distribution");
  addSummaryText(trafficDistributionResult, "legendTitle", "Camera");
  addSummaryText(trafficDistributionResult, "chartStyle", "traffic_distribution");
  addSummaryText(trafficDistributionResult, "title", "Traffic by Camera");

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("VRM traffic distribution context", {
      latestTimestamp,
      cameras: shareData.map((point) => point.x),
      shares: shareData.map((point) => point.value ?? point.y ?? 0),
    });
  }
  return trafficDistributionResult;
};

export const applyCapacityUsage = (result: ChartResult, orgId: string | undefined): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  suppressDelta(next);
  ensureSummary(next);
  const series = next.series[0];
  const uiClient = resolveUiClient(orgId);
  const capacity = lookupCapacity(orgId);
  if (!series) {
    return next;
  }

  const summary = next.meta!.summary as Record<string, unknown>;
  summary.vrmResolvedClient = uiClient ?? null;
  summary.vrmCapacity = capacity;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("VRM capacity usage context", { orgId, resolvedUiClient: uiClient, capacity });
  }

  const occupancyPoints = [...series.data];
  const normalizedSeries: DataPoint[] = occupancyPoints.map((point) => {
    const raw = point.value ?? point.y ?? 0;
    const usage = capacity > 0 ? (Number(raw) / capacity) * 100 : 0;
    return { ...point, value: usage, y: usage } as DataPoint;
  });

  series.unit = "percentage";
  series.label = "Capacity usage";
  series.data = normalizedSeries;

  const { last, previous } = getLastTwoValues({ ...series, data: normalizedSeries });
  const deltaUsage = typeof last === "number" && typeof previous === "number" ? last - previous : null;
  const usageNow = typeof last === "number" ? last : null;

  const startOfDay = getStartOfToday();
  const peakUsage = normalizedSeries.reduce((peak, point) => {
    const timestamp = point.x ? new Date(point.x) : null;
    const withinDay = timestamp ? timestamp >= startOfDay : true;
    const value = point.value ?? point.y ?? null;
    if (!withinDay || typeof value !== "number") {
      return peak;
    }
    return Math.max(peak, value);
  }, 0);

  const peakOccupancy = occupancyPoints.reduce((peak, point) => {
    const timestamp = point.x ? new Date(point.x) : null;
    const withinDay = timestamp ? timestamp >= startOfDay : true;
    const value = point.value ?? point.y ?? 0;
    if (!withinDay) {
      return peak;
    }
    return Math.max(peak, Number(value));
  }, 0);

  summary.capacity_usage_now = usageNow;
  summary.peak_capacity_usage_today = peakUsage;
  summary.occupancy_delta_15m = deltaUsage;
  summary.peak_occupancy_today = peakOccupancy;

  addSummaryText(next, "vrmChipText", `peak: ${Math.round(peakUsage)}%`);
  setHeadlineValue(next, usageNow);
  logVrmDebug(VRM_KPI_IDS.capacity, series, usageNow);
  return next;
};

export const applyFootfallTotal = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  const primary = next.series[0];
  const lastValue = lastBucketValue(primary);
  const startOfDay = getStartOfToday();
  const totalToday = primary
    ? primary.data.reduce((sum, point) => {
        const timestamp = point.x ? new Date(point.x) : null;
        const withinDay = timestamp ? timestamp >= startOfDay : true;
        const value = point.value ?? point.y ?? 0;
        if (!withinDay) {
          return sum;
        }
        return sum + (typeof value === "number" ? Number(value) : 0);
      }, 0)
    : 0;
  setHeadlineValue(next, lastValue);
  logVrmDebug(VRM_KPI_IDS.footfall, primary, lastValue);
  addSummaryText(next, "vrmChipText", `today: ${Math.round(totalToday)}`);
  suppressDelta(next);
  return next;
};

export const applyOccupancyDelta = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  const { last } = getLastTwoValues(series);
  setHeadlineValue(next, typeof last === "number" ? last : null);
  logVrmDebug(VRM_KPI_IDS.occupancy, series, typeof last === "number" ? last : null);
  return next;
};

const applyBasicVrmHeadline = (widgetId: string, result: ChartResult) => {
  const next = cloneResult(result);
  markCompact(next);
  suppressDelta(next);
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

