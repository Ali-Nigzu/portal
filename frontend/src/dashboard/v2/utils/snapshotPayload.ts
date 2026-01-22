import type { ChartResult, ChartSeries, DataPoint } from "../../../analytics/schemas/charting";
import { VRM_KPI_IDS, VRM_KPI_TITLES } from "./applyVRMOverrides";
import type { SiteFlowTimeframe } from "./siteFlowTimeframe";
import { bucketForSiteFlowTimeframe } from "./siteFlowTimeframe";

export interface SnapshotResponse {
  ts: string;
  payload: unknown[];
  mode: "snapshots";
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NAIVE_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;

const ROLLUP_INDEX: Record<SiteFlowTimeframe, number> = {
  today: 0,
  yesterday: 1,
  last_week: 2,
  last_month: 3,
  last_quarter: 4,
  last_year: 5,
  all_time: 6,
};

type SnapshotSeries = Record<string, number[]>;

interface TimeSeriesBlock {
  timestamps: unknown[];
  series: Record<string, unknown>;
}

interface NormalizedTimeSeries {
  timestamps: Date[];
  series: SnapshotSeries;
}

const asNumberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.map((item) => (typeof item === "number" ? item : 0)) : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isTimeSeriesBlock = (value: unknown): value is TimeSeriesBlock =>
  isRecord(value) &&
  Array.isArray(value.timestamps) &&
  isRecord(value.series);

const isBlockPayload = (payload: unknown[]): payload is unknown[] =>
  isRecord(payload?.[0]) && isTimeSeriesBlock(payload?.[1]);

const toIso = (value: Date): string => value.toISOString();

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const parseSnapshotTimestamp = (value: string): Date => {
  if (NAIVE_TIMESTAMP_REGEX.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
};

const sumUntilIndex = (values: number[], endIndex: number): number =>
  values.slice(0, Math.max(0, endIndex + 1)).reduce((sum, value) => sum + value, 0);

const floorToBucket = (date: Date, bucketMs: number): Date =>
  new Date(Math.floor(date.getTime() / bucketMs) * bucketMs);

const applyTodayDeltaLabel = (
  result: ChartResult,
  values: number[],
  anchor: Date,
): ChartResult => {
  if (!values.length) {
    return result;
  }
  const bucketMs = DAY_MS / values.length;
  const dayStart = startOfDay(anchor);
  const bucketStart = floorToBucket(anchor, bucketMs);
  const elapsedMs = bucketStart.getTime() - dayStart.getTime();
  const k = clamp(Math.floor(elapsedMs / bucketMs) + 1, 0, values.length);
  const startIndex = Math.max(0, values.length - k);
  const deltaValue = values.slice(startIndex).reduce((sum, value) => sum + value, 0);
  result.meta = result.meta ?? { timezone: "UTC", summary: {} };
  result.meta.summary = result.meta.summary ?? {};
  result.meta.summary.deltaLabel = `${Math.round(deltaValue)}`;
  return result;
};

const getTodayRollupSeries = (payload: unknown[], seriesIndex: number): number[] => {
  const rollups = payload[7];
  if (!Array.isArray(rollups)) {
    return [];
  }
  const todayRollup = rollups[0];
  if (!Array.isArray(todayRollup)) {
    return [];
  }
  return asNumberArray(todayRollup[seriesIndex]);
};

const buildTimeSeriesPoints = (values: number[], end: Date, stepMs: number): DataPoint[] =>
  values.map((value, index) => ({
    x: toIso(new Date(end.getTime() - (values.length - 1 - index) * stepMs)),
    y: value,
    value,
  }));

const buildKpiResult = (values: number[], snapshotTs: Date, widgetId: string): ChartResult => ({
  chartType: "single_value",
  xDimension: { id: "timestamp", type: "time", bucket: "15_MIN", timezone: "UTC" },
  series: [
    {
      id: widgetId,
      label: VRM_KPI_TITLES[widgetId] ?? widgetId,
      geometry: "line",
      data: buildTimeSeriesPoints(values, snapshotTs, FIFTEEN_MINUTES_MS),
    },
  ],
  meta: {
    timezone: "UTC",
    summary: {
      widgetId,
      title: VRM_KPI_TITLES[widgetId] ?? widgetId,
      presentation: "vrm",
    },
  },
});

const buildTrafficResult = (values: number[]): ChartResult => {
  const labels = ["Camera 0", "Camera 1", "Camera 2"];
  const normalized = Array.from({ length: 3 }, (_, index) =>
    typeof values[index] === "number" ? values[index] : 0,
  );
  const data = normalized.map((value, index) => ({
    x: labels[index] ?? `Camera ${index + 1}`,
    y: value,
    value,
  }));
  const series: ChartSeries = {
    id: "traffic_share",
    label: "Traffic by Camera",
    geometry: "bar",
    unit: "percentage",
    data,
  };
  return {
    chartType: "categorical",
    xDimension: { id: "camera", type: "category" },
    series: [series],
    meta: {
      timezone: "UTC",
      summary: {
        presentation: "vrm",
        chartStyle: "traffic_distribution",
        chartSubType: "traffic_distribution",
        traffic_distribution_source: "snapshot_pct",
        title: "Traffic Split",
      },
    },
  };
};

const buildTrafficResultFromSplit = (entries: Array<{ label: string; value: number }>): ChartResult => {
  const data = entries.map((entry, index) => ({
    x: entry.label ?? `Camera ${index + 1}`,
    y: entry.value ?? 0,
    value: entry.value ?? 0,
  }));
  const series: ChartSeries = {
    id: "traffic_share",
    label: "Traffic by Camera",
    geometry: "bar",
    unit: "percentage",
    data,
  };
  return {
    chartType: "categorical",
    xDimension: { id: "camera", type: "category" },
    series: [series],
    meta: {
      timezone: "UTC",
      summary: {
        presentation: "vrm",
        chartStyle: "traffic_distribution",
        chartSubType: "traffic_distribution",
        title: "Traffic Split",
      },
    },
  };
};

const buildCapacityResult = (values: number[]): ChartResult => {
  const [currentRaw = 0, peakRaw = 0] = values;
  const currentPct = clamp(currentRaw, 0, 100);
  const peakPct = clamp(Math.max(peakRaw, currentRaw), 0, 100);
  return {
    chartType: "categorical",
    xDimension: { id: "capacity_segment", type: "category" },
    series: [
      {
        id: "capacity",
        label: "Capacity usage",
        geometry: "bar",
        unit: "percentage",
        data: [
          { x: "Usage", value: currentPct, y: currentPct },
          { x: "Peak extra", value: peakPct, y: peakPct },
        ],
      },
    ],
    meta: {
      timezone: "UTC",
      summary: {
        presentation: "vrm",
        chartStyle: "capacity_usage",
        chartSubType: "capacity_usage",
        title: "Capacity",
        headlineValue: currentPct,
        capacity_usage_source: "snapshot_pct",
        capacity_current_pct: currentPct,
        capacity_peak_pct: peakPct,
      },
    },
  };
};

const buildCapacityResultFromBlock = (value: unknown): ChartResult => {
  if (!isRecord(value)) {
    return buildCapacityResult([]);
  }
  const percentage = typeof value.percentage === "number" ? value.percentage : undefined;
  const capacity = typeof value.capacity === "number" ? value.capacity : undefined;
  const used = typeof value.used === "number" ? value.used : undefined;
  const computedPct =
    percentage ??
    (typeof capacity === "number" && capacity > 0 && typeof used === "number"
      ? (used / capacity) * 100
      : 0);
  return buildCapacityResult([computedPct, 0]);
};

const inferBucketForLegacy = (
  timeframe: SiteFlowTimeframe,
  length: number,
): "RAW" | "HOUR" | "DAY" | "WEEK" | "MONTH" => {
  if (timeframe === "today" || timeframe === "yesterday") {
    return "RAW";
  }
  if (timeframe === "last_week") {
    return "DAY";
  }
  if (timeframe === "last_month") {
    return length <= 7 ? "WEEK" : "DAY";
  }
  if (timeframe === "last_quarter") {
    return "WEEK";
  }
  if (timeframe === "last_year") {
    return "MONTH";
  }
  return length <= 12 ? "MONTH" : "WEEK";
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);

const addYears = (date: Date, years: number): Date =>
  new Date(date.getFullYear() + years, 0, 1, 0, 0, 0, 0);

const buildAnchoredTimestamps = (
  timeframe: SiteFlowTimeframe,
  anchor: Date,
  length: number,
): Date[] => {
  if (length <= 0) {
    return [];
  }
  if (timeframe === "today" || timeframe === "yesterday") {
    const start = timeframe === "today" ? startOfDay(anchor) : startOfDay(new Date(anchor.getTime() - DAY_MS));
    const stepMs = DAY_MS / length;
    return Array.from({ length }, (_, index) => new Date(start.getTime() + index * stepMs));
  }

  if (timeframe === "last_week") {
    const endDayStart = startOfDay(anchor);
    const start = addDays(endDayStart, -(length - 1));
    return Array.from({ length }, (_, index) => addDays(start, index));
  }

  if (timeframe === "last_month") {
    if (length <= 5) {
      const monthStart = startOfMonth(anchor);
      const firstWeekStart = startOfWeek(monthStart);
      return Array.from({ length }, (_, index) => addDays(firstWeekStart, index * 7));
    }
    const start = startOfMonth(anchor);
    return Array.from({ length }, (_, index) => addDays(start, index));
  }

  if (timeframe === "last_quarter") {
    const endWeekStart = startOfWeek(anchor);
    const start = addDays(endWeekStart, -7 * (length - 1));
    return Array.from({ length }, (_, index) => addDays(start, index * 7));
  }

  if (timeframe === "last_year") {
    const endMonthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    const start = addMonths(endMonthStart, -(length - 1));
    return Array.from({ length }, (_, index) => addMonths(start, index));
  }

  if (timeframe === "all_time") {
    const anchorYear = anchor.getFullYear();
    const start = new Date(anchorYear - (length - 1), 0, 1, 0, 0, 0, 0);
    return Array.from({ length }, (_, index) => addYears(start, index));
  }

  const start = startOfYear(anchor);
  return Array.from({ length }, (_, index) => addYears(start, index));
};

const normalizeSeriesLength = (values: number[], count: number): number[] => {
  const sliced = values.slice(0, count);
  if (sliced.length >= count) {
    return sliced;
  }
  return [...sliced, ...Array.from({ length: count - sliced.length }, () => 0)];
};

const lastNonZeroIndex = (values: number[]): number => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== 0) {
      return index;
    }
  }
  return -1;
};

const buildSiteFlowResult = (
  rollup: unknown[],
  snapshotTs: Date,
  timeframe: SiteFlowTimeframe,
  snapshotTsRaw?: string,
  source?: string,
  rollupIndex?: number,
): ChartResult => {
  const entrances = asNumberArray(rollup?.[0]);
  const exits = asNumberArray(rollup?.[1]);
  const occupancyAvg = asNumberArray(rollup?.[2]);
  const occupancyMin = asNumberArray(rollup?.[3]);
  const occupancyMax = asNumberArray(rollup?.[4]);

  const length = Math.max(
    entrances.length,
    exits.length,
    occupancyAvg.length,
    occupancyMin.length,
    occupancyMax.length,
  );

  const desiredLength =
    timeframe === "last_week" ? 7 : timeframe === "last_quarter" ? 12 : timeframe === "last_year" ? 12 : length;

  let sliceCount = timeframe === "last_week" || timeframe === "last_quarter" || timeframe === "last_year"
    ? desiredLength
    : length;
  const idxNonZero = Math.max(
    lastNonZeroIndex(entrances),
    lastNonZeroIndex(exits),
    lastNonZeroIndex(occupancyAvg),
  );
  let idxNow: number | null = null;
  let sliceLenTime: number | null = null;
  const dayStart = startOfDay(snapshotTs);
  const weekStart = startOfWeek(snapshotTs);
  const monthStart = startOfMonth(snapshotTs);
  const bucketMsToday = length > 0 ? DAY_MS / length : null;
  if (timeframe === "today" && length > 0) {
    const elapsedMs = snapshotTs.getTime() - dayStart.getTime();
    idxNow = Math.floor(elapsedMs / (bucketMsToday ?? DAY_MS));
    sliceLenTime = clamp(idxNow + 1, 0, length);
    const sliceLenNonZero = idxNonZero >= 0 ? idxNonZero + 1 : sliceLenTime;
    sliceCount = Math.min(sliceLenTime, sliceLenNonZero);
  }

  const timestamps =
    timeframe === "today"
      ? Array.from({ length }, (_, index) => new Date(dayStart.getTime() + index * (bucketMsToday ?? DAY_MS)))
          .slice(0, sliceCount)
      : buildAnchoredTimestamps(timeframe, snapshotTs, sliceCount);
  const bucket = inferBucketForLegacy(timeframe, sliceCount);
  const bucketStepMs =
    sliceCount > 1 ? timestamps[1].getTime() - timestamps[0].getTime() : null;
  const nonZeroLastIndex = idxNonZero;

  const normalizedEntrances = normalizeSeriesLength(entrances, sliceCount);
  const normalizedExits = normalizeSeriesLength(exits, sliceCount);
  const normalizedOccAvg = normalizeSeriesLength(occupancyAvg, sliceCount);
  const normalizedOccMin = normalizeSeriesLength(occupancyMin, sliceCount);
  const normalizedOccMax = normalizeSeriesLength(occupancyMax, sliceCount);

  const buildSeries = (id: string, values: number[]): ChartSeries => ({
    id,
    label: id,
    geometry: "line",
    data: timestamps.map((timestamp, index) => ({
      x: toIso(timestamp),
      y: values[index] ?? 0,
      value: values[index] ?? 0,
    })),
  });

  const occupancySeries: ChartSeries = {
    id: "occupancy",
    label: "Occupancy",
    geometry: "line",
    data: timestamps.map((timestamp, index) => ({
      x: toIso(timestamp),
      occupancy_avg: normalizedOccAvg[index] ?? null,
      occupancy_min: normalizedOccMin[index] ?? null,
      occupancy_max: normalizedOccMax[index] ?? null,
      value: normalizedOccAvg[index] ?? null,
      y: normalizedOccAvg[index] ?? null,
    })),
  };

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[Snapshots] Site Flow debug", {
      snapshotTsRaw,
      snapshotTsParsed: snapshotTs.toISOString(),
      timeframe,
      source,
      rollupIndex,
      valuesLength: {
        entrances: entrances.length,
        exits: exits.length,
        occupancyAvg: occupancyAvg.length,
        occupancyMin: occupancyMin.length,
        occupancyMax: occupancyMax.length,
      },
      bucket,
      bucketStepMs,
      idxNow,
      sliceLenTime,
      nonZeroLastIndex,
      sliceCount,
      dayStartIso: dayStart.toISOString(),
      weekStartIso: weekStart.toISOString(),
      monthStartIso: monthStart.toISOString(),
      bucketMsToday,
      computedStartIso: timestamps[0]?.toISOString(),
      computedEndIso: timestamps[timestamps.length - 1]?.toISOString(),
      firstPointXIso: timestamps[0]?.toISOString(),
      lastPointXIso: timestamps[timestamps.length - 1]?.toISOString(),
    });
  }

  if (process.env.NODE_ENV !== "production" && timeframe === "today") {
    const lastLabel = timestamps[timestamps.length - 1];
    const anchorIso = snapshotTs.toISOString();
    const lastLabelIso = lastLabel?.toISOString();
    const lastLabelIsFuture = Boolean(lastLabel && lastLabel.getTime() > snapshotTs.getTime());
    // eslint-disable-next-line no-console
    console.log("[Snapshots] Site Flow today debug", {
      payloadTsRaw: snapshotTsRaw,
      payloadTsParsedISO: anchorIso,
      dayStartISO: dayStart.toISOString(),
      N: length,
      bucketMs: bucketMsToday,
      idxNow,
      sliceLen: sliceCount,
      firstLabelISO: timestamps[0]?.toISOString(),
      lastLabelISO: lastLabelIso,
      lastLabelIsFuture,
    });
  }

  return {
    chartType: "composed_time",
    xDimension: { id: "timestamp", type: "time", bucket, timezone: "UTC" },
    series: [
      buildSeries("entrances", normalizedEntrances),
      buildSeries("exits", normalizedExits),
      {
        ...occupancySeries,
        data: occupancySeries.data.slice(0, sliceCount),
      },
    ],
    meta: {
      timezone: "UTC",
      summary: {
        title: "Site Flow",
        presentation: "vrm",
        siteFlowTimeframe: timeframe,
      },
    },
  };
};

const buildDemographicResult = (values: number[], kind: "age" | "gender" | "race"): ChartResult => ({
  chartType: "categorical",
  xDimension: { id: kind, type: "category" },
  series: [
    {
      id: `${kind}_distribution`,
      label: kind,
      geometry: "bar",
      data: values.map((value, index) => ({
        x: String(index),
        y: value,
        value,
      })),
    },
  ],
  meta: { timezone: "UTC", summary: { title: kind } },
});

const buildDemographicResultFromRecord = (
  values: Record<string, number>,
  kind: "age" | "gender" | "race",
): ChartResult => ({
  chartType: "categorical",
  xDimension: { id: kind, type: "category" },
  series: [
    {
      id: `${kind}_distribution`,
      label: kind,
      geometry: "bar",
      data: Object.entries(values).map(([label, value]) => ({
        x: label,
        y: value,
        value,
      })),
    },
  ],
  meta: { timezone: "UTC", summary: { title: kind } },
});

const parseTimestamp = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const normalizeTimeSeriesBlock = (block: TimeSeriesBlock): NormalizedTimeSeries => {
  const rawTimestamps = Array.isArray(block.timestamps) ? block.timestamps : [];
  const parsed = rawTimestamps.map((value) => parseTimestamp(value));
  const validIndexes = parsed
    .map((value, index) => (value ? index : -1))
    .filter((index) => index >= 0);

  const timestamps = validIndexes.map((index) => parsed[index] as Date);
  const series: SnapshotSeries = {};

  Object.entries(block.series ?? {}).forEach(([key, value]) => {
    if (!Array.isArray(value)) {
      return;
    }
    const numbers = asNumberArray(value);
    series[key] = validIndexes.map((index) => numbers[index]).filter((item) => item !== undefined);
  });

  const lengths = [timestamps.length, ...Object.values(series).map((values) => values.length)].filter(
    (value) => value > 0,
  );
  const minLength = lengths.length > 0 ? Math.min(...lengths) : 0;
  const trimmedTimestamps = minLength > 0 ? timestamps.slice(0, minLength) : [];
  const trimmedSeries: SnapshotSeries = {};

  Object.entries(series).forEach(([key, values]) => {
    trimmedSeries[key] = minLength > 0 ? values.slice(0, minLength) : [];
  });

  if (trimmedTimestamps.length > 1) {
    const first = trimmedTimestamps[0].getTime();
    const last = trimmedTimestamps[trimmedTimestamps.length - 1].getTime();
    if (first > last) {
      trimmedTimestamps.reverse();
      Object.keys(trimmedSeries).forEach((key) => {
        trimmedSeries[key] = trimmedSeries[key].slice().reverse();
      });
    }
  }

  return { timestamps: trimmedTimestamps, series: trimmedSeries };
};

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const startOfWeek = (date: Date): Date => {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
};

const endOfWeek = (date: Date): Date => {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return endOfDay(next);
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const endOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const startOfQuarter = (date: Date): Date => {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
};

const endOfQuarter = (date: Date): Date => {
  const quarterStart = startOfQuarter(date);
  return new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0, 23, 59, 59, 999);
};

const startOfYear = (date: Date): Date => new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);

const endOfYear = (date: Date): Date => new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);

const resolveTimeframeWindow = (timeframe: SiteFlowTimeframe, anchor: Date): { from: Date; to: Date } => {
  switch (timeframe) {
    case "today":
      return { from: startOfDay(anchor), to: anchor };
    case "yesterday": {
      const yesterday = new Date(anchor.getTime() - DAY_MS);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case "last_week":
      return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
    case "last_month":
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case "last_quarter":
      return { from: startOfQuarter(anchor), to: endOfQuarter(anchor) };
    case "last_year":
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case "all_time":
    default:
      return { from: new Date(0), to: anchor };
  }
};

const filterSeriesByWindow = (
  timeSeries: NormalizedTimeSeries,
  window: { from: Date; to: Date },
): NormalizedTimeSeries => {
  const indices = timeSeries.timestamps
    .map((timestamp, index) =>
      timestamp >= window.from && timestamp <= window.to ? index : -1,
    )
    .filter((index) => index >= 0);

  const timestamps = indices.map((index) => timeSeries.timestamps[index]);
  const series: SnapshotSeries = {};

  Object.entries(timeSeries.series).forEach(([key, values]) => {
    series[key] = indices.map((index) => values[index]).filter((item) => item !== undefined);
  });

  return { timestamps, series };
};

const resolveAggregationKind = (seriesKey: string): "sum" | "avg" | "min" | "max" => {
  const lower = seriesKey.toLowerCase();
  if (lower.includes("min")) {
    return "min";
  }
  if (lower.includes("max")) {
    return "max";
  }
  if (lower.includes("occupancy") || lower.includes("usage") || lower.includes("percentage") || lower.includes("dwell")) {
    return "avg";
  }
  return "sum";
};

const aggregateSeriesByBucket = (
  timeSeries: NormalizedTimeSeries,
  bucket: "day" | "month",
): NormalizedTimeSeries => {
  const bucketKeys: string[] = [];
  const bucketStarts = new Map<string, Date>();

  const getBucketStart = (date: Date): Date => {
    if (bucket === "day") {
      return startOfDay(date);
    }
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  };

  timeSeries.timestamps.forEach((timestamp) => {
    const start = getBucketStart(timestamp);
    const key =
      bucket === "day"
        ? `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`
        : `${start.getFullYear()}-${start.getMonth()}`;
    if (!bucketStarts.has(key)) {
      bucketStarts.set(key, start);
      bucketKeys.push(key);
    }
  });

  const timestamps = bucketKeys.map((key) => bucketStarts.get(key) as Date);
  const series: SnapshotSeries = {};

  Object.entries(timeSeries.series).forEach(([key, values]) => {
    const kind = resolveAggregationKind(key);
    const aggregates = new Map<
      string,
      { sum: number; count: number; min: number; max: number }
    >();

    values.forEach((value, index) => {
      const timestamp = timeSeries.timestamps[index];
      if (!timestamp) {
        return;
      }
      const start = getBucketStart(timestamp);
      const bucketKey =
        bucket === "day"
          ? `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`
          : `${start.getFullYear()}-${start.getMonth()}`;
      const current = aggregates.get(bucketKey) ?? {
        sum: 0,
        count: 0,
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      };
      aggregates.set(bucketKey, {
        sum: current.sum + value,
        count: current.count + 1,
        min: Math.min(current.min, value),
        max: Math.max(current.max, value),
      });
    });

    series[key] = bucketKeys.map((bucketKey) => {
      const stats = aggregates.get(bucketKey);
      if (!stats) {
        return 0;
      }
      switch (kind) {
        case "min":
          return Number.isFinite(stats.min) ? stats.min : 0;
        case "max":
          return Number.isFinite(stats.max) ? stats.max : 0;
        case "avg":
          return stats.count > 0 ? stats.sum / stats.count : 0;
        case "sum":
        default:
          return stats.sum;
      }
    });
  });

  return { timestamps, series };
};

const buildTimeSeriesPointsFromTimestamps = (timestamps: Date[], values: number[]): DataPoint[] =>
  timestamps.map((timestamp, index) => ({
    x: toIso(timestamp),
    y: values[index] ?? 0,
    value: values[index] ?? 0,
  }));

const resolveSeriesValues = (
  timeSeries: NormalizedTimeSeries,
  keys: string[],
  fallback: number[] = [],
): number[] => {
  for (const key of keys) {
    const values = timeSeries.series[key];
    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
  }
  return fallback;
};

const ensureSeriesLength = (values: number[], length: number, fillValue = 0): number[] => {
  if (values.length === length) {
    return values;
  }
  const next = values.slice(0, length);
  while (next.length < length) {
    next.push(fillValue);
  }
  return next;
};

const bucketForSnapshotTimeframe = (timeframe: SiteFlowTimeframe): "RAW" | "DAY" | "WEEK" | "MONTH" => {
  switch (timeframe) {
    case "today":
    case "yesterday":
      return "RAW";
    case "last_week":
    case "last_month":
      return "DAY";
    case "last_quarter":
      return "WEEK";
    case "last_year":
    case "all_time":
    default:
      return "MONTH";
  }
};

const buildKpiResultFromSeries = (
  timeSeries: NormalizedTimeSeries,
  widgetId: string,
): ChartResult => {
  const seriesKeyMap: Record<string, string[]> = {
    [VRM_KPI_IDS.entrances]: ["entrances", "in"],
    [VRM_KPI_IDS.exits]: ["exits", "out"],
    [VRM_KPI_IDS.occupancy]: ["occupancy", "occupancy_avg"],
    [VRM_KPI_IDS.footfall]: ["footfall"],
    [VRM_KPI_IDS.dwell]: ["dwell", "dwell_time"],
  };
  const values = resolveSeriesValues(timeSeries, seriesKeyMap[widgetId] ?? []);
  const alignedValues = ensureSeriesLength(values, timeSeries.timestamps.length, 0);
  return {
    chartType: "single_value",
    xDimension: { id: "timestamp", type: "time", bucket: "RAW", timezone: "UTC" },
    series: [
      {
        id: widgetId,
        label: VRM_KPI_TITLES[widgetId] ?? widgetId,
        geometry: "line",
        data: buildTimeSeriesPointsFromTimestamps(timeSeries.timestamps, alignedValues),
      },
    ],
    meta: {
      timezone: "UTC",
      summary: {
        widgetId,
        title: VRM_KPI_TITLES[widgetId] ?? widgetId,
        presentation: "vrm",
      },
    },
  };
};

const buildSiteFlowResultFromSeries = (
  timeSeries: NormalizedTimeSeries,
  snapshotTs: Date,
  timeframe: SiteFlowTimeframe,
): ChartResult => {
  const window = resolveTimeframeWindow(timeframe, snapshotTs);
  let filteredSeries = filterSeriesByWindow(timeSeries, window);

  if (timeframe === "last_week") {
    filteredSeries = aggregateSeriesByBucket(filteredSeries, "day");
  }

  if (timeframe === "last_year") {
    filteredSeries = aggregateSeriesByBucket(filteredSeries, "month");
  }

  const timestamps = filteredSeries.timestamps;
  const entrances = ensureSeriesLength(
    resolveSeriesValues(filteredSeries, ["entrances", "in"]),
    timestamps.length,
    0,
  );
  const exits = ensureSeriesLength(
    resolveSeriesValues(filteredSeries, ["exits", "out"]),
    timestamps.length,
    0,
  );
  const occupancyAvg = ensureSeriesLength(
    resolveSeriesValues(filteredSeries, ["occupancy_avg", "occupancy", "usage"]),
    timestamps.length,
    0,
  );
  const occupancyMin = ensureSeriesLength(
    resolveSeriesValues(filteredSeries, ["occupancy_min"]),
    timestamps.length,
    0,
  );
  const occupancyMax = ensureSeriesLength(
    resolveSeriesValues(filteredSeries, ["occupancy_max"]),
    timestamps.length,
    0,
  );

  const buildSeries = (id: string, values: number[]): ChartSeries => ({
    id,
    label: id,
    geometry: "line",
    data: timestamps.map((timestamp, index) => ({
      x: toIso(timestamp),
      y: values[index] ?? 0,
      value: values[index] ?? 0,
    })),
  });

  const occupancySeries: ChartSeries = {
    id: "occupancy",
    label: "Occupancy",
    geometry: "line",
    data: timestamps.map((timestamp, index) => ({
      x: toIso(timestamp),
      occupancy_avg: occupancyAvg[index] ?? null,
      occupancy_min: occupancyMin[index] ?? null,
      occupancy_max: occupancyMax[index] ?? null,
      value: occupancyAvg[index] ?? null,
      y: occupancyAvg[index] ?? null,
    })),
  };

  return {
    chartType: "composed_time",
    xDimension: { id: "timestamp", type: "time", bucket: bucketForSnapshotTimeframe(timeframe), timezone: "UTC" },
    series: [
      buildSeries("entrances", entrances),
      buildSeries("exits", exits),
      occupancySeries,
    ],
    meta: {
      timezone: "UTC",
      summary: {
        title: "Site Flow",
        presentation: "vrm",
        siteFlowTimeframe: timeframe,
      },
    },
  };
};

export const buildSnapshotWidgetResult = (
  widgetId: string,
  snapshot: SnapshotResponse,
  timeframe: SiteFlowTimeframe,
): ChartResult => {
  const snapshotTs = parseSnapshotTimestamp(snapshot.ts);
  const payload = snapshot.payload ?? [];
  if (!Array.isArray(payload)) {
    throw new Error("Snapshot payload is not an array");
  }

  if (isBlockPayload(payload)) {
    const timeSeriesBlock = payload[1] as TimeSeriesBlock;
    const normalizedSeries = normalizeTimeSeriesBlock(timeSeriesBlock);

    switch (widgetId) {
      case VRM_KPI_IDS.entrances:
      case VRM_KPI_IDS.occupancy:
      case VRM_KPI_IDS.exits:
      case VRM_KPI_IDS.footfall:
      case VRM_KPI_IDS.dwell:
        return buildKpiResultFromSeries(normalizedSeries, widgetId);
      case VRM_KPI_IDS.capacity:
        return buildCapacityResultFromBlock(payload[3]);
      case VRM_KPI_IDS.traffic: {
        const trafficEntries = Array.isArray(payload[4])
          ? payload[4]
              .filter((entry): entry is { label: string; value: number } =>
                isRecord(entry) && typeof entry.label === "string" && typeof entry.value === "number",
              )
          : [];
        return buildTrafficResultFromSplit(trafficEntries);
      }
      case "live-flow":
      case "site-flow":
        return buildSiteFlowResultFromSeries(normalizedSeries, snapshotTs, timeframe);
      case "site-flow-demographics-age": {
        const demographics = payload[6];
        if (isRecord(demographics) && isRecord(demographics.age)) {
          return buildDemographicResultFromRecord(demographics.age as Record<string, number>, "age");
        }
        return buildDemographicResult([], "age");
      }
      case "site-flow-demographics-gender": {
        const demographics = payload[6];
        if (isRecord(demographics) && isRecord(demographics.gender)) {
          return buildDemographicResultFromRecord(
            demographics.gender as Record<string, number>,
            "gender",
          );
        }
        return buildDemographicResult([], "gender");
      }
      case "site-flow-demographics-race": {
        const demographics = payload[6];
        if (isRecord(demographics) && isRecord(demographics.race)) {
          return buildDemographicResultFromRecord(
            demographics.race as Record<string, number>,
            "race",
          );
        }
        return buildDemographicResult([], "race");
      }
      default:
        throw new Error(`Snapshot payload mapping not implemented for widget ${widgetId}`);
    }
  }

  switch (widgetId) {
    case VRM_KPI_IDS.entrances: {
      const result = buildKpiResult(asNumberArray(payload[0]), snapshotTs, widgetId);
      const todaySeries = getTodayRollupSeries(payload, 0);
      return todaySeries.length ? applyTodayDeltaLabel(result, todaySeries, snapshotTs) : result;
    }
    case VRM_KPI_IDS.occupancy:
      return buildKpiResult(asNumberArray(payload[1]), snapshotTs, widgetId);
    case VRM_KPI_IDS.exits: {
      const result = buildKpiResult(asNumberArray(payload[2]), snapshotTs, widgetId);
      const todaySeries = getTodayRollupSeries(payload, 1);
      return todaySeries.length ? applyTodayDeltaLabel(result, todaySeries, snapshotTs) : result;
    }
    case VRM_KPI_IDS.footfall:
      return buildKpiResult(asNumberArray(payload[3]), snapshotTs, widgetId);
    case VRM_KPI_IDS.dwell:
      return buildKpiResult(asNumberArray(payload[4]), snapshotTs, widgetId);
    case VRM_KPI_IDS.capacity:
      return buildCapacityResult(asNumberArray(payload[5]));
    case VRM_KPI_IDS.traffic:
      return buildTrafficResult(asNumberArray(payload[6]));
    case "live-flow":
    case "site-flow": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      const source = Array.isArray(rollups) ? `rollup_${rollupIndex}` : "unknown";
      return buildSiteFlowResult(rollup ?? [], snapshotTs, timeframe, snapshot.ts, source, rollupIndex);
    }
    case "site-flow-demographics-age": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      return buildDemographicResult(asNumberArray(rollup?.[5]), "age");
    }
    case "site-flow-demographics-gender": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      return buildDemographicResult(asNumberArray(rollup?.[6]), "gender");
    }
    case "site-flow-demographics-race": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      return buildDemographicResult(asNumberArray(rollup?.[7]), "race");
    }
    default:
      throw new Error(`Snapshot payload mapping not implemented for widget ${widgetId}`);
  }
};
