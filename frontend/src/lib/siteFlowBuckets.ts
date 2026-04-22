import { formatSiteFlowTick } from "../analytics/components/ChartRenderer/utils/formatSiteFlowTick";
import type { SiteFlowTimeframe } from "./siteFlowTimeframe";
import { startOfDay, startOfMonth, startOfWeek, startOfYear } from "./timeWindows";
import { formatDemoTimestamp, getDemoHour, startOfDemoDay } from "./demoTime";
const DAY_MS = 24 * 60 * 60 * 1000;
const addHours = (date: Date, hours: number): Date => {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
};
const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const addYears = (date: Date, years: number): Date =>
  new Date(date.getFullYear() + years, 0, 1, 0, 0, 0, 0);
const addMonths = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
export const inferSiteFlowBucket = (
  timeframe: SiteFlowTimeframe,
  _length: number,
): "RAW" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" => {
  if (timeframe === "today" || timeframe === "yesterday") {
    return "HOUR";
  }
  if (timeframe === "last_week") {
    return "DAY";
  }
  if (timeframe === "last_month") {
    return "WEEK";
  }
  if (timeframe === "last_quarter") {
    return "WEEK";
  }
  if (timeframe === "last_year") {
    return "MONTH";
  }
  return "YEAR";
};
export const resolveSiteFlowSliceCount = (
  timeframe: SiteFlowTimeframe,
  anchor: Date,
  seriesList: number[][],
): {
  length: number;
  sliceCount: number;
  dayStart: Date;
} => {
  const length = Math.max(...seriesList.map((series) => series.length), 0);
  const dayStart = startOfDemoDay(anchor);
  const sliceCount =
    timeframe === "today"
      ? Math.min(
          length > 0 ? length : 24,
          Math.min(getDemoHour(anchor) + 1, 24),
        )
      : timeframe === "yesterday"
        ? 24
        : timeframe === "last_week"
          ? 7
          : timeframe === "last_month"
            ? 4
            : timeframe === "last_quarter"
              ? 12
              : timeframe === "last_year"
                ? 12
                : length;
  return { length, sliceCount, dayStart };
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
    const start =
      timeframe === "today"
        ? startOfDemoDay(anchor)
        : startOfDemoDay(new Date(anchor.getTime() - DAY_MS));
    return Array.from({ length }, (_, index) => addHours(start, index));
  }
  if (timeframe === "last_week") {
    const start = addDays(startOfDay(anchor), -6);
    return Array.from({ length }, (_, index) => addDays(start, index));
  }
  if (timeframe === "last_month") {
    const mostRecentMonday = startOfWeek(anchor);
    const start = addDays(mostRecentMonday, -7 * (length - 1));
    return Array.from({ length }, (_, index) => addDays(start, index * 7));
  }
  if (timeframe === "last_quarter") {
    const endWeekStart = startOfWeek(anchor);
    const start = addDays(endWeekStart, -7 * (length - 1));
    return Array.from({ length }, (_, index) => addDays(start, index * 7));
  }
  if (timeframe === "last_year") {
    const endMonthStart = startOfMonth(anchor);
    const start = addMonths(endMonthStart, -(length - 1));
    return Array.from({ length }, (_, index) => addMonths(start, index));
  }
  const endYearStart = startOfYear(anchor);
  const start = addYears(endYearStart, -(length - 1));
  return Array.from({ length }, (_, index) => addYears(start, index));
};
export const buildSiteFlowBucketLabels = (
  timeframe: SiteFlowTimeframe,
  anchor: Date,
  seriesList: number[][],
): {
  labels: string[];
  bucket: string;
  timestamps: Date[];
  sliceCount: number;
} => {
  const { length, sliceCount, dayStart } = resolveSiteFlowSliceCount(
    timeframe,
    anchor,
    seriesList,
  );
  const timestamps =
    timeframe === "today"
      ? Array.from({ length: sliceCount }, (_, index) =>
          addHours(dayStart, index),
        )
      : buildAnchoredTimestamps(timeframe, anchor, sliceCount);
  const bucket = inferSiteFlowBucket(timeframe, sliceCount);
  const labels = timestamps.map((timestamp) =>
    formatSiteFlowTick(timeframe, bucket, formatDemoTimestamp(timestamp)),
  );
  return { labels, bucket, timestamps, sliceCount };
};
