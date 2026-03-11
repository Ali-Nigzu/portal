import type {
  ChartResult,
  ChartSeries,
  DataPoint,
} from "../../../analytics/schemas/charting";
import { VRM_KPI_IDS } from "./applyVRMOverrides";
const CAPACITY_BY_CLIENT: Record<string, number> = { client1: 5, client2: 750 };
const TABLE_TO_UI_CLIENT: Record<string, string> = {
  client0: "client1",
  "demodata0.client1": "client2",
  "demodata0.client1_compat": "client2",
};
const normalizeOrgId = (orgId: string | undefined) =>
  orgId?.replace(/_compat$/, "").toLowerCase();
export const resolveUiClient = (
  orgId: string | undefined,
): string | undefined => {
  const normalized = normalizeOrgId(orgId);
  if (!normalized) {
    return undefined;
  }
  if (CAPACITY_BY_CLIENT[normalized] !== undefined) {
    return normalized;
  }
  const mapped = TABLE_TO_UI_CLIENT[normalized];
  if (mapped && CAPACITY_BY_CLIENT[mapped] !== undefined) {
    return mapped;
  }
  return undefined;
};
export const lookupCapacity = (orgId: string | undefined): number => {
  const uiClient = resolveUiClient(orgId);
  const capacity = uiClient ? CAPACITY_BY_CLIENT[uiClient] : undefined;
  if (capacity === undefined) {
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
export const markCompact = (result: ChartResult) => {
  ensureSummary(result);
  result.meta.summary!.presentation = "vrm";
  result.meta.summary!.compact = 1 as unknown as string | number | null;
};
const numberOrNull = (value: unknown) =>
  typeof value === "number" ? value : null;
type OccupancyPoint = {
  occupancy_min?: number | null;
  occupancy_max?: number | null;
  occupancy_avg?: number | null;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  value?: number | null;
};
const applySiteFlow = (result: ChartResult): ChartResult => {
  const entranceColor = "var(--vrm-color-accent-entrances, #58626e)";
  const exitColor = "var(--vrm-color-accent-exits, #66707d)";
  const occupancyColor = "var(--vrm-color-accent-occupancy, #9b7420)";
  const occupancySeries =
    result.series.find((series) => series.id === "occupancy") ??
    result.series.find((series) =>
      (series.data ?? []).some(
        (point) =>
          "occupancy_min" in (point ?? {}) ||
          "occupancy_max" in (point ?? {}) ||
          "occupancy_avg" in (point ?? {}),
      ),
    );
  const occupancyAxis = occupancySeries?.axis;
  // Site Flow occupancy points may carry occupancy_avg/min/max fields (snapshot rollups).
  const occupancyData = (occupancySeries?.data ?? []).map((point) => {
    const occupancyPoint = point as unknown as OccupancyPoint;
    const min = numberOrNull(
      occupancyPoint.occupancy_min ?? occupancyPoint.min,
    );
    const max = numberOrNull(
      occupancyPoint.occupancy_max ?? occupancyPoint.max,
    );
    const avg = numberOrNull(
      occupancyPoint.occupancy_avg ??
        occupancyPoint.avg ??
        occupancyPoint.value,
    );
    return {
      x: point.x,
      y: avg,
      value: avg,
      coverage: point.coverage ?? null,
      rawCount:
        (point as unknown as { rawCount?: number | null }).rawCount ?? null,
      occupancy_min: min,
      occupancy_max: max,
      occupancy_avg: avg,
    } satisfies DataPoint & {
      occupancy_min: number | null;
      occupancy_max: number | null;
      occupancy_avg: number | null;
    };
  });
  const occupancyAvgLine: ChartSeries | null =
    occupancySeries && occupancyData.length > 0
      ? {
          id: "occupancy",
          label: "Occupancy",
          geometry: "line",
          axis: occupancyAxis,
          unit: "people",
          seriesGroup: "occupancy",
          noDots: true,
          color: occupancyColor,
          data: occupancyData,
        }
      : null;
  const bars = result.series
    .filter((series) => {
      if (series.id === "throughput") {
        return false;
      }
      if (occupancySeries && series.id === occupancySeries.id) {
        return false;
      }
      return !series.id.startsWith("occupancy_");
    })
    .map((series) => {
      if (series.id === "entrances") {
        return {
          ...series,
          geometry: "bar" as const,
          unit: "events",
          label: "Entrances",
          color: entranceColor,
        };
      }
      if (series.id === "exits") {
        return {
          ...series,
          geometry: "bar" as const,
          unit: "events",
          label: "Exits",
          color: exitColor,
        };
      }
      return series;
    });
  return {
    ...result,
    meta: {
      ...(result.meta ?? { timezone: "UTC" }),
      summary: { ...(result.meta?.summary ?? {}), title: "Site Flow" },
    },
    series: [
      ...bars,
      ...(occupancyAvgLine ? [occupancyAvgLine] : []),
    ],
  };
};
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
const applyLastBucketHeadline = (widgetId: string, result: ChartResult) => {
  const series = result.series?.[0];
  const lastValue = lastBucketValue(series);
  setHeadlineValue(result, lastValue);
};
const lastNonNullValue = (series?: ChartSeries): number | null => {
  if (!series) {
    return null;
  }
  for (let index = series.data.length - 1; index >= 0; index -= 1) {
    const point = series.data[index];
    const value = point?.value ?? point?.y;
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
};
const addSummaryText = (result: ChartResult, key: string, value?: string) => {
  if (!value) {
    return;
  }
  ensureSummary(result);
  result.meta.summary![key] = value;
};
const getLastTwoValues = (
  series?: ChartSeries,
): { last: number | null; previous: number | null } => {
  if (!series || !series.data.length) {
    return { last: null, previous: null };
  }
  const lastPoint = series.data[series.data.length - 1];
  const previousPoint = series.data[series.data.length - 2];
  const last = (lastPoint?.value ?? lastPoint?.y ?? null) as number | null;
  const previous = (previousPoint?.value ?? previousPoint?.y ?? null) as
    | number
    | null;
  return { last, previous };
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
      chartStyle: "traffic_distribution",
      chartSubType: "traffic_distribution",
      title: "Traffic Split",
    },
    timezone: "UTC",
  },
});
export const applyTrafficDistributionShare = (
  result: ChartResult,
): ChartResult => {
  const trafficDistributionResult = cloneResult(result);
  markCompact(trafficDistributionResult);
  ensureSummary(trafficDistributionResult);
  (trafficDistributionResult as unknown as { chartStyle?: string }).chartStyle =
    "traffic_distribution";
  (
    trafficDistributionResult as unknown as { chartSubType?: string }
  ).chartSubType = "traffic_distribution";
  trafficDistributionResult.meta.summary!.chartStyle = "traffic_distribution";
  trafficDistributionResult.meta.summary!.chartSubType = "traffic_distribution";
  const seriesList = trafficDistributionResult.series ?? [];
  const summary = trafficDistributionResult.meta.summary as Record<
    string,
    unknown
  >;
  const isSnapshotPct = summary.traffic_distribution_source === "snapshot_pct";
  if (seriesList.length === 0) {
    return buildTrafficPlaceholderResult();
  }
  if (isSnapshotPct) {
    const baseSeries = seriesList[0];
    const baseData = baseSeries?.data ?? [];
    const normalized = Array.from({ length: 3 }, (_, index) => {
      const point = baseData[index];
      const rawValue = Number(point?.value ?? point?.y ?? 0);
      return {
        camera: String(point?.x ?? `Camera ${index}`),
        value: Number.isFinite(rawValue) ? rawValue : 0,
      };
    });
    let topCamera = normalized[0]?.camera ?? "Camera 0";
    let topShare = normalized[0]?.value ?? 0;
    normalized.forEach(({ camera, value }) => {
      if (value >= topShare) {
        topShare = value;
        topCamera = camera;
      }
    });
    const shareData: DataPoint[] = normalized.map(({ camera, value }) => ({
      x: camera,
      value,
      y: value,
    }));
    trafficDistributionResult.chartType = "categorical";
    trafficDistributionResult.xDimension = {
      id: "camera",
      type: "category",
    } as ChartResult["xDimension"];
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
    addSummaryText(
      trafficDistributionResult,
      "headline",
      `${topCamera} – ${Math.round(topShare)}%`,
    );
    addSummaryText(
      trafficDistributionResult,
      "chartSubType",
      "traffic_distribution",
    );
    addSummaryText(trafficDistributionResult, "legendTitle", "Camera");
    addSummaryText(
      trafficDistributionResult,
      "chartStyle",
      "traffic_distribution",
    );
    addSummaryText(trafficDistributionResult, "title", "Traffic Split");
    return trafficDistributionResult;
  }
  return trafficDistributionResult;
};
export const applyCapacityUsage = (
  result: ChartResult,
  orgId: string | undefined,
): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  const series = next.series[0];
  const uiClient = resolveUiClient(orgId);
  const capacity = lookupCapacity(orgId);
  if (!series) {
    return next;
  }
  const summary = next.meta!.summary as Record<string, unknown>;
  const isSnapshotPct = summary.capacity_usage_source === "snapshot_pct";
  summary.vrmResolvedClient = uiClient ?? null;
  summary.vrmCapacity = capacity;
  if (isSnapshotPct) {
    const currentRaw = Number(
      summary.capacity_current_pct ??
        series.data[0]?.value ??
        series.data[0]?.y ??
        0,
    );
    const peakRaw = Number(summary.capacity_peak_pct ?? currentRaw);
    const currentPct = Math.min(Math.max(currentRaw, 0), 100);
    const peakPct = Math.min(Math.max(peakRaw, currentPct), 100);
    const peakExtra = Math.max(0, peakPct - currentPct);
    const remainder = Math.max(0, 100 - peakPct);
    summary.capacity_usage_now = currentPct;
    summary.peak_capacity_usage_today = peakPct;
    summary.occupancy_delta_15m = null;
    summary.peak_occupancy_today = null;
    addSummaryText(next, "vrmChipText", `peak: ${Math.round(peakPct)}%`);
    addSummaryText(next, "chartStyle", "capacity_usage");
    addSummaryText(next, "chartSubType", "capacity_usage");
    addSummaryText(next, "title", "Capacity");
    next.chartType = "categorical";
    next.xDimension = {
      id: "capacity_segment",
      type: "category",
    } as ChartResult["xDimension"];
    series.unit = "percentage";
    series.label = "Capacity usage";
    series.geometry = "bar";
    series.data = [
      { x: "Usage", value: currentPct, y: currentPct },
      { x: "Peak extra", value: peakExtra, y: peakExtra },
      { x: "Remaining", value: remainder, y: remainder },
    ];
    setHeadlineValue(next, currentPct);
    return next;
  }
  return next;
};
export const applyFootfallTotal = (result: ChartResult): ChartResult =>
  applyFootfallDelta(result);
export const applyOccupancyDelta = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  const { last } = getLastTwoValues(series);
  setHeadlineValue(next, typeof last === "number" ? last : null);
  return next;
};
const applyBasicVrmHeadline = (widgetId: string, result: ChartResult) => {
  const next = cloneResult(result);
  markCompact(next);
  applyLastBucketHeadline(widgetId, next);
  return next;
};
const applyVrmTotalChip = (
  widgetId: string,
  result: ChartResult,
): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  applyLastBucketHeadline(widgetId, next);
  return next;
};
const applyFootfallDelta = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  const primary = next.series[0];
  const lastValue = lastBucketValue(primary);
  setHeadlineValue(next, lastValue);
  return next;
};
const applyDwellHeadline = (result: ChartResult) => {
  const next = applyBasicVrmHeadline(VRM_KPI_IDS.dwell, result);
  const summary = next.meta?.summary;
  const headline = summary?.headlineValue;
  if (headline === null || typeof headline !== "number") {
    const series = next.series?.[0];
    const carried = lastNonNullValue(series);
    if (typeof carried === "number") {
      setHeadlineValue(next, carried);
    }
  }
  return next;
};
export const decorateResult = (
  widgetId: string,
  result: ChartResult,
  orgId: string | undefined,
): ChartResult => {
  if (widgetId === "live-flow" || widgetId === "site-flow") {
    return applySiteFlow(result);
  }
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
  if (widgetId === VRM_KPI_IDS.dwell) {
    return applyDwellHeadline(result);
  }
  if (widgetId === VRM_KPI_IDS.entrances || widgetId === VRM_KPI_IDS.exits) {
    return applyVrmTotalChip(widgetId, result);
  }
  return result;
};
