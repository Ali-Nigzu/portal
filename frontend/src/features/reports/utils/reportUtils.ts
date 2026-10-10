import {
  formatDemoTimestamp,
  parseDemoTimestamp,
  getDemoHour,
  startOfDemoDay,
} from "../../../analytics/components/ChartRenderer/utils/format";

export type ReportTimeframe =
  | "today"
  | "yesterday"
  | "last_week"
  | "last_month"
  | "last_quarter"
  | "last_year"
  | "all_time";

export const TIMEFRAME_OPTIONS: Array<{
  id: ReportTimeframe;
  label: string;
}> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_week", label: "Last Week" },
  { id: "last_month", label: "Last Month" },
  { id: "last_quarter", label: "Last Quarter" },
  { id: "last_year", label: "Last Year" },
  { id: "all_time", label: "All Time" },
];

export const AGE_BUCKET_LABELS = [
  "0-4",
  "5-13",
  "14-25",
  "26-45",
  "46-65",
  "66+",
];
export const SEX_BUCKET_LABELS = ["Male", "Female"];

const clampEnd = (snapshotTs: Date, now: Date): Date =>
  snapshotTs.getTime() <= now.getTime() ? snapshotTs : now;

const collapseIfInverted = (
  start: Date,
  end: Date,
): { start: Date; end: Date } =>
  end.getTime() < start.getTime() ? { start: end, end } : { start, end };

const formatDay = (value: Date): string =>
  value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatTime = (value: Date): string =>
  value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatDayRange = (start: Date, end: Date): string => {
  if (start.getTime() === end.getTime()) {
    return formatDay(end);
  }
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `${start.getDate()}–${formatDay(end)}`;
  }
  return `${formatDay(start)}–${formatDay(end)}`;
};

const formatMonthYear = (value: Date): string =>
  value.toLocaleDateString("en-GB", { month: "short", year: "numeric" });

const formatMonthRange = (start: Date, end: Date): string => {
  if (start.getTime() === end.getTime()) {
    return formatMonthYear(end);
  }
  return `${formatMonthYear(start)} – ${formatMonthYear(end)}`;
};

const formatWeekOf = (value: Date): string =>
  `week of ${formatDay(startOfWeek(value))}`;

const formatWeekOfRange = (start: Date, end: Date): string =>
  `${formatWeekOf(start)} to ${formatWeekOf(end)}`;

const startOfPreviousDay = (value: Date): Date => {
  const next = new Date(value);
  next.setDate(next.getDate() - 1);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (value: Date, days: number): Date => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfTrailingYear = (end: Date): Date =>
  new Date(end.getFullYear() - 1, end.getMonth() + 1, 1, 0, 0, 0, 0);

const startOfAllTimeCoverage = (end: Date): Date =>
  new Date(end.getFullYear() - 2, 0, 1, 0, 0, 0, 0);

const startOfWeekBucketRange = (
  end: Date,
  buckets: number,
): { start: Date; endWeekStart: Date } => {
  const endWeekStart = startOfWeek(end);
  const start = addDays(endWeekStart, -7 * (buckets - 1));
  return { start, endWeekStart };
};

export const getTimeframeOption = (timeframe: ReportTimeframe) =>
  TIMEFRAME_OPTIONS.find((option) => option.id === timeframe) ??
  TIMEFRAME_OPTIONS[0];

export const getReportHeaderRange = (
  timeframe: ReportTimeframe,
  snapshotTs: Date,
  now: Date = new Date(),
  startOverride?: Date,
): { start: Date; end: Date; labelLine: string } => {
  const end = clampEnd(snapshotTs, now);
  const window = resolveSiteFlowWindow(timeframe, end);
  const resolvedStart = startOverride ?? window.from;
  const { start, end: clampedEnd } = collapseIfInverted(resolvedStart, end);
  if (timeframe === "today") {
    return {
      start,
      end: clampedEnd,
      labelLine: `${formatDay(clampedEnd)} (up to ${formatTime(clampedEnd)})`,
    };
  }
  if (timeframe === "yesterday") {
    const yesterdayStart = startOfPreviousDay(clampedEnd);
    return {
      start: yesterdayStart,
      end: clampedEnd,
      labelLine: formatDay(yesterdayStart),
    };
  }
  if (timeframe === "last_week") {
    const weekStart = startOfWeek(clampedEnd);
    return {
      start: weekStart,
      end: clampedEnd,
      labelLine: formatDayRange(weekStart, clampedEnd),
    };
  }
  if (timeframe === "last_month") {
    const { start: monthStart, endWeekStart } = startOfWeekBucketRange(
      clampedEnd,
      4,
    );
    return {
      start: monthStart,
      end: clampedEnd,
      labelLine: formatWeekOfRange(monthStart, endWeekStart),
    };
  }
  if (timeframe === "last_quarter") {
    const { start: quarterStart, endWeekStart } = startOfWeekBucketRange(
      clampedEnd,
      12,
    );
    return {
      start: quarterStart,
      end: clampedEnd,
      labelLine: formatWeekOfRange(quarterStart, endWeekStart),
    };
  }
  if (timeframe === "last_year") {
    const trailingYearStart = startOfTrailingYear(clampedEnd);
    return {
      start: trailingYearStart,
      end: clampedEnd,
      labelLine: formatMonthRange(trailingYearStart, clampedEnd),
    };
  }
  const allTimeStart = startOverride ?? startOfAllTimeCoverage(clampedEnd);
  const yearLabel = `${allTimeStart.getFullYear()} – ${clampedEnd.getFullYear()}`;
  return { start: allTimeStart, end: clampedEnd, labelLine: yearLabel };
};

export const formatReportDateRange = (
  snapshotTs: Date,
  timeframe: ReportTimeframe,
  now: Date = new Date(),
  startOverride?: Date,
): { label: string; subtitle: string; start: Date; end: Date } => {
  const { label } = getTimeframeOption(timeframe);
  const { start, end, labelLine } = getReportHeaderRange(
    timeframe,
    snapshotTs,
    now,
    startOverride,
  );
  return { label, subtitle: `${label} • ${labelLine}`, start, end };
};

const DAY_MS = 24 * 60 * 60 * 1000;

type TimeWindowKey = ReportTimeframe;

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
  return new Date(
    quarterStart.getFullYear(),
    quarterStart.getMonth() + 3,
    0,
    23,
    59,
    59,
    999,
  );
};

export const startOfYear = (date: Date): Date =>
  new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);

export const endOfYear = (date: Date): Date =>
  new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);

export const resolveSiteFlowWindow = (
  timeframe: TimeWindowKey,
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
      return { from: startOfYear(anchor), to: anchor };
  }
};

const toDate = (value: string): Date | null => parseDemoTimestamp(value);
const formatHour = (date: Date, withMinutes: boolean): string => {
  const hour = date.getHours().toString().padStart(2, "0");
  return withMinutes ? `${hour}:00` : hour;
};
const formatWeekday = (date: Date): string =>
  date.toLocaleDateString("en-US", { weekday: "short" });
const formatMonthDay = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
const formatWeekLabel = (date: Date): string => `Wk of ${formatMonthDay(date)}`;
const formatMonth = (date: Date, withYear = false): string =>
  date.toLocaleDateString("en-US", {
    month: "short",
    year: withYear ? "numeric" : undefined,
  });
export const formatSiteFlowTick = (
  timeframe: string | undefined,
  bucket: string | undefined,
  label: string,
): string => {
  const parsed = toDate(label);
  if (!parsed) {
    return label;
  }
  switch (timeframe) {
    case "today":
    case "yesterday":
      return formatHour(parsed, true);
    case "last_week":
      return formatWeekday(parsed);
    case "last_month":
      return formatWeekLabel(parsed);
    case "last_quarter":
      return formatWeekLabel(parsed);
    case "last_year":
      return formatMonth(parsed, false);
    case "all_time":
      return String(parsed.getFullYear());
    default:
      return label;
  }
};

const addHours = (date: Date, hours: number): Date => {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
};
const addBucketDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const addYears = (date: Date, years: number): Date =>
  new Date(date.getFullYear() + years, 0, 1, 0, 0, 0, 0);
const addMonths = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
export const inferSiteFlowBucket = (
  timeframe: ReportTimeframe,
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
  timeframe: ReportTimeframe,
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
  timeframe: ReportTimeframe,
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
    const start = addBucketDays(startOfDay(anchor), -6);
    return Array.from({ length }, (_, index) => addBucketDays(start, index));
  }
  if (timeframe === "last_month") {
    const mostRecentMonday = startOfWeek(anchor);
    const start = addBucketDays(mostRecentMonday, -7 * (length - 1));
    return Array.from({ length }, (_, index) =>
      addBucketDays(start, index * 7),
    );
  }
  if (timeframe === "last_quarter") {
    const endWeekStart = startOfWeek(anchor);
    const start = addBucketDays(endWeekStart, -7 * (length - 1));
    return Array.from({ length }, (_, index) =>
      addBucketDays(start, index * 7),
    );
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
  timeframe: ReportTimeframe,
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
