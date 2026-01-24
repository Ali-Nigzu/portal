import { formatSiteFlowTick } from "../../../analytics/components/ChartRenderer/utils/formatSiteFlowTick";
import type { SiteFlowTimeframe } from "./siteFlowTimeframe";

const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const endOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

export const startOfWeek = (date: Date): Date => {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
};

export const endOfWeek = (date: Date): Date => {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return endOfDay(next);
};

export const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

export const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

export const startOfQuarter = (date: Date): Date => {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
};

export const endOfQuarter = (date: Date): Date => {
  const quarterStart = startOfQuarter(date);
  return new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0, 23, 59, 59, 999);
};

export const startOfYear = (date: Date): Date => new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);

export const endOfYear = (date: Date): Date => new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);

export const resolveSiteFlowWindow = (
  timeframe: SiteFlowTimeframe,
  anchor: Date,
): { from: Date; to: Date } => {
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

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);

export const inferSiteFlowBucket = (
  timeframe: SiteFlowTimeframe,
  length: number,
): "RAW" | "HOUR" | "DAY" | "WEEK" | "MONTH" => {
  if (timeframe === "today" || timeframe === "yesterday") {
    return "HOUR";
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

const lastNonZeroIndex = (values: number[]): number => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== 0) {
      return index;
    }
  }
  return -1;
};

const normalizeSeriesLength = (values: number[], count: number): number[] => {
  const sliced = values.slice(0, count);
  if (sliced.length >= count) {
    return sliced;
  }
  return [...sliced, ...Array.from({ length: count - sliced.length }, () => 0)];
};

export const resolveSiteFlowSliceCount = (
  timeframe: SiteFlowTimeframe,
  anchor: Date,
  seriesList: number[][],
): { length: number; sliceCount: number; bucketMsToday: number | null; dayStart: Date } => {
  const length = Math.max(...seriesList.map((series) => series.length), 0);
  const desiredLength =
    timeframe === "last_week" ? 7 : timeframe === "last_quarter" ? 12 : timeframe === "last_year" ? 12 : length;
  let sliceCount = timeframe === "last_week" || timeframe === "last_quarter" || timeframe === "last_year"
    ? desiredLength
    : length;
  const dayStart = startOfDay(anchor);
  const bucketMsToday = length > 0 ? DAY_MS / length : null;

  if (timeframe === "today" && length > 0) {
    const normalizedSeries = seriesList.map((values) => normalizeSeriesLength(values, length));
    const idxNonZero = Math.max(...normalizedSeries.map(lastNonZeroIndex));
    const elapsedMs = anchor.getTime() - dayStart.getTime();
    const idxNow = Math.floor(elapsedMs / (bucketMsToday ?? DAY_MS));
    const sliceLenTime = Math.min(Math.max(idxNow + 1, 0), length);
    const sliceLenNonZero = idxNonZero >= 0 ? idxNonZero + 1 : sliceLenTime;
    sliceCount = Math.min(sliceLenTime, sliceLenNonZero);
  }

  return { length, sliceCount, bucketMsToday, dayStart };
};

export const buildAnchoredTimestamps = (
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

  const endMonthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
  const start = addMonths(endMonthStart, -(length - 1));
  return Array.from({ length }, (_, index) => addMonths(start, index));
};

export const buildSiteFlowBucketLabels = (
  timeframe: SiteFlowTimeframe,
  anchor: Date,
  seriesList: number[][],
): { labels: string[]; bucket: string; timestamps: Date[]; sliceCount: number } => {
  const { length, sliceCount, bucketMsToday, dayStart } = resolveSiteFlowSliceCount(
    timeframe,
    anchor,
    seriesList,
  );
  const timestamps =
    timeframe === "today"
      ? Array.from({ length }, (_, index) => new Date(dayStart.getTime() + index * (bucketMsToday ?? DAY_MS)))
          .slice(0, sliceCount)
      : buildAnchoredTimestamps(timeframe, anchor, sliceCount);
  const bucket = inferSiteFlowBucket(timeframe, sliceCount);
  const labels = timestamps.map((timestamp) =>
    formatSiteFlowTick(timeframe, bucket, timestamp.toISOString()),
  );

  return { labels, bucket, timestamps, sliceCount };
};
