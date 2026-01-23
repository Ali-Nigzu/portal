import type { ChartResult, ChartSeries, DataPoint } from "../../../analytics/schemas/charting";
import { VRM_KPI_IDS } from "./applyVRMOverrides";

const CAPACITY_BY_CLIENT: Record<string, number> = {
  client1: 5,
  client2: 750,
};

const CAMERAS_BY_CLIENT: Record<string, string[]> = {
  client1: ["Cam 0"],
  client2: ["Cam 1", "Cam 2"],
};

const TABLE_TO_UI_CLIENT: Record<string, string> = {
  client0: "client1",
  "demodata0.client1": "client2",
  "demodata0.client1_compat": "client2",
};

const normalizeOrgId = (orgId: string | undefined) => orgId?.replace(/_compat$/, "").toLowerCase();

export const resolveUiClient = (orgId: string | undefined): string | undefined => {
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

export const markCompact = (result: ChartResult) => {
  ensureSummary(result);
  result.meta.summary!.presentation = "vrm";
  result.meta.summary!.compact = 1 as unknown as string | number | null;
};

const numberOrNull = (value: unknown) => (typeof value === "number" ? value : null);

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
  const occupancySeries =
    result.series.find((series) => series.id === "occupancy") ??
    result.series.find((series) =>
      (series.data ?? []).some(
        (point) => "occupancy_min" in (point ?? {}) || "occupancy_max" in (point ?? {}) || "occupancy_avg" in (point ?? {})
      ),
    );
  const occupancyColor = occupancySeries?.color ?? "var(--vrm-color-accent-occupancy, #2d6cdf)";
  const occupancyAxis = occupancySeries?.axis;

  const occupancyBand = (occupancySeries?.data ?? []).map((point) => {
    const occupancyPoint = point as unknown as OccupancyPoint;
    const min = numberOrNull(occupancyPoint.occupancy_min ?? occupancyPoint.min);
    const max = numberOrNull(occupancyPoint.occupancy_max ?? occupancyPoint.max);
    const avg = numberOrNull(occupancyPoint.occupancy_avg ?? occupancyPoint.avg ?? occupancyPoint.value);
    const span = min !== null && max !== null ? max - min : null;
    return {
      x: point.x,
      y: min,
      coverage: point.coverage ?? null,
      rawCount: (point as unknown as { rawCount?: number | null }).rawCount ?? null,
      occupancy_min: min,
      occupancy_max: max,
      occupancy_avg: avg,
      occupancy_span: span,
    } satisfies DataPoint & {
      occupancy_min: number | null;
      occupancy_max: number | null;
      occupancy_avg: number | null;
      occupancy_span: number | null;
    };
  });

  const occupancyMinLine: ChartSeries = {
    id: "occupancy_min",
    label: "Occupancy (min)",
    geometry: "line",
    axis: occupancyAxis,
    unit: "people",
    seriesGroup: "occupancy",
    noDots: true,
    hideInLegend: true,
    color: occupancyColor,
    strokeOpacity: 0.45,
    data: occupancyBand.map((point) => ({ ...point, y: point.occupancy_min })),
  };

  const occupancyMaxLine: ChartSeries = {
    id: "occupancy_max",
    label: "Occupancy (max)",
    geometry: "line",
    axis: occupancyAxis,
    unit: "people",
    seriesGroup: "occupancy",
    noDots: true,
    hideInLegend: true,
    color: occupancyColor,
    strokeOpacity: 0.6,
    data: occupancyBand.map((point) => ({ ...point, y: point.occupancy_max })),
  };

  const occupancyAvgLine: ChartSeries = {
    id: "occupancy_avg",
    label: "Occupancy (avg)",
    geometry: "line",
    axis: occupancyAxis,
    unit: "people",
    seriesGroup: "occupancy",
    noDots: true,
    color: occupancyColor,
    data: occupancyBand.map((point) => ({ ...point, y: point.occupancy_avg })),
  };

  const occupancyBandBase: ChartSeries = {
    id: "occupancy_band_base",
    label: "Occupancy band base",
    geometry: "area",
    stack: "occupancy-band",
    color: occupancyColor,
    fillOpacity: 0,
    strokeOpacity: 0,
    hideInLegend: true,
    hideInTooltip: true,
    axis: occupancyAxis,
    unit: "people",
    seriesGroup: "occupancy",
    data: occupancyBand.map((point) => ({ ...point, y: point.occupancy_min })),
  };

  const occupancyBandSpan: ChartSeries = {
    id: "occupancy_band_span",
    label: "Occupancy (min–max)",
    geometry: "area",
    stack: "occupancy-band",
    color: occupancyColor,
    fillOpacity: 0.22,
    strokeOpacity: 0.9,
    hideInLegend: true,
    hideInTooltip: true,
    axis: occupancyAxis,
    unit: "people",
    seriesGroup: "occupancy",
    data: occupancyBand.map((point) => ({ ...point, y: point.occupancy_span })),
  };

  const bars = result.series
    .filter((series) => series.id !== "occupancy" && series.id !== "throughput")
    .map((series) => {
      if (series.id === "entrances" || series.id === "exits") {
        return { ...series, geometry: "bar" as const, unit: "events" };
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
      occupancyBandBase,
      occupancyBandSpan,
      occupancyMinLine,
      occupancyMaxLine,
      occupancyAvgLine,
    ],
  };
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
  const summary = result.meta?.summary as Record<string, unknown> | undefined;
  const summaryNow = summary?.capacity_usage_now;
  const summaryPeak = summary?.peak_capacity_usage_today;
  if (typeof summaryNow === "number" && typeof summaryPeak === "number") {
    return { currentUsage: summaryNow, peakToday: summaryPeak };
  }
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
      chartStyle: "traffic_distribution",
      chartSubType: "traffic_distribution",
      title: "Traffic Split",
    },
    timezone: "UTC",
  },
});

const deriveCameraLabel = (series: ChartSeries, index: number): string => {
  const labelCandidate = series.label && series.label.toLowerCase() !== "events" ? series.label : null;
  const source = labelCandidate ?? series.id ?? `Camera ${index + 1}`;
  const normalized = String(source).trim();
  const tokens = normalized.split(/\||:|=/);
  const lastToken = tokens[tokens.length - 1]?.trim();
  const cleaned = lastToken?.replace(/camera[_\s-]?id[:\s-]*/i, "").replace(/^cam\s*/i, "").trim();
  return (cleaned && cleaned.length > 0 ? cleaned : lastToken) || `Camera ${index + 1}`;
};

export const applyTrafficDistributionShare = (result: ChartResult, orgId?: string): ChartResult => {
  const trafficDistributionResult = cloneResult(result);
  markCompact(trafficDistributionResult);
  ensureSummary(trafficDistributionResult);
  // ChartRenderer traffic routing relies on both top-level and summary style hints.
  // Ensure they are always present for decorated VRM traffic results.
  (trafficDistributionResult as unknown as { chartStyle?: string }).chartStyle = "traffic_distribution";
  (trafficDistributionResult as unknown as { chartSubType?: string }).chartSubType = "traffic_distribution";
  trafficDistributionResult.meta.summary!.chartStyle = "traffic_distribution";
  trafficDistributionResult.meta.summary!.chartSubType = "traffic_distribution";
  const seriesList = trafficDistributionResult.series ?? [];
  const summary = trafficDistributionResult.meta.summary as Record<string, unknown>;
  const isSnapshotPct = summary.traffic_distribution_source === "snapshot_pct";

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[VRM] applyTrafficDistributionShare: entry", {
      widgetId: VRM_KPI_IDS.traffic,
      seriesCount: seriesList.length,
      orgId,
      sample: seriesList[0]?.data?.slice(0, 3),
    });
  }

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
    addSummaryText(trafficDistributionResult, "title", "Traffic Split");
    return trafficDistributionResult;
  }

  const parseTimestamp = (value: unknown): Date | null => {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === "number") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.valueOf()) ? null : parsed;
    }
    if (typeof value === "string") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.valueOf()) ? null : parsed;
    }
    return null;
  };

  const hasTimestampBuckets = seriesList.some((series) =>
    series.data.some((point) => parseTimestamp(point?.x ?? null) !== null),
  );

  let latestTimestampMs: number | null = null;
  if (hasTimestampBuckets) {
    const allTimestamps = seriesList
      .flatMap((series) => series.data.map((point) => parseTimestamp(point.x)))
      .filter((value): value is Date => value !== null)
      .map((value) => value.valueOf())
      .filter((value) => !Number.isNaN(value));
    if (allTimestamps.length > 0) {
      latestTimestampMs = Math.max(...allTimestamps);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[VRM] applyTrafficDistributionShare: bucket discovery", {
      seriesCount: seriesList.length,
      hasTimestampBuckets,
      latestTimestamp: latestTimestampMs,
      samplePoints: seriesList[0]?.data?.slice(0, 3),
    });
  }

  const cameraShares = hasTimestampBuckets
    ? seriesList
        .map((series, index) => {
          let latestPoint: DataPoint | undefined;
          if (latestTimestampMs !== null) {
            latestPoint = series.data.find((point) => {
              const parsed = parseTimestamp(point.x);
              return parsed?.valueOf() === latestTimestampMs;
            });
          }
          const resolvedPoint = latestPoint ?? series.data[series.data.length - 1];
          if (!resolvedPoint) {
            return null;
          }
          const raw = resolvedPoint.value ?? resolvedPoint.y ?? latestPoint?.value ?? latestPoint?.y ?? 0;
          const numericValue = Number(raw);
          if (!Number.isFinite(numericValue)) {
            return null;
          }
          const camera = deriveCameraLabel(series, index);
          return { camera, value: numericValue };
        })
        .filter((entry): entry is { camera: string; value: number } => Boolean(entry))
    : seriesList[0].data
        .map((point, index) => {
          const numericValue = Number(point.value ?? point.y ?? 0);
          if (!Number.isFinite(numericValue)) {
            return null;
          }
          return {
            camera: String(point.x ?? seriesList[0].label ?? `Camera ${index + 1}`),
            value: numericValue,
          };
        })
        .filter((entry): entry is { camera: string; value: number } => Boolean(entry));

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[VRM] applyTrafficDistributionShare: last bucket values", {
      cameras: cameraShares.map((share) => share.camera),
      counts: cameraShares.map((share) => share.value),
      totalLastBucketCount: cameraShares.reduce((sum, { value }) => sum + value, 0),
    });
  }

  const total = cameraShares.reduce((sum, { value }) => sum + value, 0);
  let topCamera = cameraShares[0]?.camera ?? "Camera";
  let topShare: number | null = null;

  if (!cameraShares.length || total <= 0) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[VRM] applyTrafficDistributionShare: empty after filtering", {
        cameraShares,
        total,
      });
    }

    const resolvedUiClient = resolveUiClient(orgId);
    const configuredNames = resolvedUiClient ? CAMERAS_BY_CLIENT[resolvedUiClient] : undefined;
    const discoveredNames = cameraShares.length
      ? cameraShares.map((share) => share.camera)
      : seriesList.map((series, index) => deriveCameraLabel(series, index)).filter(Boolean);
    const fallbackNames = configuredNames?.length
      ? configuredNames
      : discoveredNames.length > 0
        ? discoveredNames
        : ["Camera 0"];

    const shareData: DataPoint[] = fallbackNames.map((camera) => ({ x: camera, value: 0, y: 0 }));

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
    setHeadlineValue(trafficDistributionResult, 0);
    addSummaryText(trafficDistributionResult, "headline", `${fallbackNames[0] ?? "Camera"} – 0%`);
    addSummaryText(trafficDistributionResult, "chartSubType", "traffic_distribution");
    addSummaryText(trafficDistributionResult, "legendTitle", "Camera");
    addSummaryText(trafficDistributionResult, "chartStyle", "traffic_distribution");
    addSummaryText(trafficDistributionResult, "title", "Traffic Split");

    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[VRM] applyTrafficDistributionShare: decorated empty result", {
        chartType: trafficDistributionResult.chartType,
        chartStyle: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.chartStyle,
        chartSubType: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.chartSubType,
        presentation: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.presentation,
        headlineValue: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.headlineValue,
        dataLength: shareData.length,
      });
    }
    return trafficDistributionResult;
  }

  const shareData: DataPoint[] = cameraShares.map(({ camera, value }) => {
    const share = total > 0 ? (value / total) * 100 : 0;
    if (topShare === null || share >= topShare) {
      topShare = share;
      topCamera = camera;
    }
    return { x: camera, value: share, y: share } as DataPoint;
  });

  if (process.env.NODE_ENV !== "production") {
    const sharesPreview = shareData.map((point) => point.value ?? point.y ?? 0);
    const camerasPreview = shareData.map((point) => point.x);
    // eslint-disable-next-line no-console
    console.log("[VRM] applyTrafficDistributionShare: share summary", {
      total,
      cameras: camerasPreview,
      shares: sharesPreview,
      topCamera,
      topShare,
    });
  }

  const headlineShare = topShare ?? 0;
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
  setHeadlineValue(trafficDistributionResult, headlineShare);
  addSummaryText(trafficDistributionResult, "headline", `${topCamera} – ${Math.round(headlineShare)}%`);
  addSummaryText(trafficDistributionResult, "chartSubType", "traffic_distribution");
  addSummaryText(trafficDistributionResult, "legendTitle", "Camera");
  addSummaryText(trafficDistributionResult, "chartStyle", "traffic_distribution");
  addSummaryText(trafficDistributionResult, "title", "Traffic Split");

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[VRM] applyTrafficDistributionShare: decorated result", {
      chartType: trafficDistributionResult.chartType,
      chartStyle: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.chartStyle,
      chartSubType: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.chartSubType,
      presentation: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.presentation,
      headlineValue: (trafficDistributionResult.meta?.summary as Record<string, unknown> | undefined)?.headlineValue,
      dataLength: shareData.length,
    });
  }
  return trafficDistributionResult;
};

export const applyCapacityUsage = (result: ChartResult, orgId: string | undefined): ChartResult => {
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

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("VRM capacity usage context", { orgId, resolvedUiClient: uiClient, capacity });
  }

  if (isSnapshotPct) {
    const currentRaw = Number(summary.capacity_current_pct ?? series.data[0]?.value ?? series.data[0]?.y ?? 0);
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
    next.xDimension = { id: "capacity_segment", type: "category" } as ChartResult["xDimension"];
    series.unit = "percentage";
    series.label = "Capacity usage";
    series.geometry = "bar";
    series.data = [
      { x: "Usage", value: currentPct, y: currentPct },
      { x: "Peak extra", value: peakExtra, y: peakExtra },
      { x: "Remaining", value: remainder, y: remainder },
    ];

    setHeadlineValue(next, currentPct);
    logVrmDebug(VRM_KPI_IDS.capacity, series, currentPct);
    return next;
  }

  const occupancyPoints = [...series.data];
  const normalizedSeries: DataPoint[] = occupancyPoints.map((point) => {
    const raw = point.value ?? point.y ?? 0;
    const usage = capacity > 0 ? (Number(raw) / capacity) * 100 : 0;
    return { ...point, value: usage, y: usage } as DataPoint;
  });

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
  addSummaryText(next, "chartStyle", "capacity_usage");
  addSummaryText(next, "chartSubType", "capacity_usage");
  addSummaryText(next, "title", "Capacity");

  const usageValue = typeof usageNow === "number" && Number.isFinite(usageNow) ? usageNow : 0;
  const peakValue = Number.isFinite(peakUsage) ? peakUsage : 0;
  const donutUsage = Math.min(Math.max(usageValue, 0), 100);
  const donutPeak = Math.min(Math.max(peakValue, donutUsage), 100);
  const peakExtra = Math.max(0, donutPeak - donutUsage);
  const remainder = Math.max(0, 100 - donutPeak);

  next.chartType = "categorical";
  next.xDimension = { id: "capacity_segment", type: "category" } as ChartResult["xDimension"];
  series.unit = "percentage";
  series.label = "Capacity usage";
  series.geometry = "bar";
  series.data = [
    { x: "Usage", value: donutUsage, y: donutUsage },
    { x: "Peak extra", value: peakExtra, y: peakExtra },
    { x: "Remaining", value: remainder, y: remainder },
  ];

  setHeadlineValue(next, usageValue);
  logVrmDebug(VRM_KPI_IDS.capacity, series, usageValue);
  return next;
};

export const applyFootfallTotal = (result: ChartResult): ChartResult => applyFootfallDelta(result);

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
  applyLastBucketHeadline(widgetId, next);
  return next;
};

const applyVrmTotalChip = (widgetId: string, result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  applyLastBucketHeadline(widgetId, next);
  const total = sumSeries(next.series?.[0]);
  addSummaryText(next, "vrmChipText", `${Math.round(total)}`);
  return next;
};

const applyFootfallDelta = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  const primary = next.series[0];
  const lastValue = lastBucketValue(primary);
  setHeadlineValue(next, lastValue);
  logVrmDebug(VRM_KPI_IDS.footfall, primary, lastValue);
  const summary = next.meta?.summary as Record<string, unknown> | undefined;
  if (summary?.vrmChipText) {
    delete summary.vrmChipText;
  }
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
      logVrmDebug(VRM_KPI_IDS.dwell, series, carried);
    }
  }
  return next;
};

export const decorateResult = (
  widgetId: string,
  result: ChartResult,
  orgId: string | undefined,
): ChartResult => {
  if (process.env.NODE_ENV !== "production") {
    const summary = result.meta?.summary as Record<string, unknown> | undefined;
    // eslint-disable-next-line no-console
    console.log("[VRM] decorateResult", {
      widgetId,
      clientContextId: orgId,
      chartType: result.chartType,
      chartStyle: summary?.chartStyle,
      chartSubType: summary?.chartSubType,
    });
  }
  if (widgetId === "live-flow" || widgetId === "site-flow") {
    return applySiteFlow(result);
  }
  const fixedIds = new Set<string>(Object.values(VRM_KPI_IDS));
  if (!fixedIds.has(widgetId)) {
    return result;
  }
  markCompact(result);
  if (widgetId === VRM_KPI_IDS.traffic) {
    const decorated = applyTrafficDistributionShare(result, orgId);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[VRM traffic] decorated result", {
        chartType: decorated.chartType,
        chartStyle: (decorated as unknown as Record<string, unknown>)?.chartStyle,
        chartSubType: (decorated as unknown as Record<string, unknown>)?.chartSubType,
        summaryChartStyle: decorated.meta?.summary?.chartStyle,
        summaryChartSubType: decorated.meta?.summary?.chartSubType,
        presentation: decorated.meta?.summary?.presentation,
        headline: decorated.meta?.summary?.headlineValue,
        seriesCount: decorated.series?.length,
        firstSeriesSample: decorated.series?.[0]?.data?.slice(0, 5),
      });
    }
    return decorated;
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
