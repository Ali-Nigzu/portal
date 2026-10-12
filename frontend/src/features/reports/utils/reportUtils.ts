import { dayBucketTimes, elapsedDayBuckets, periodBucketTimes } from "../../organisation-dashboard/snapshotTime";
const formatDemoTimestamp = (value: Date) => value.toISOString();
const parseDemoTimestamp = (value: string) => {
  const result = new Date(value);
  return Number.isFinite(result.valueOf()) ? result : null;
};
const startOfDemoDay = (value: Date) => new Date(dayBucketTimes(value.toISOString(), 1)[0]);


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
  value.toLocaleDateString("en-GB", { timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatTime = (value: Date): string =>
  value.toLocaleTimeString("en-GB", { timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatDayRange = (start: Date, end: Date): string => {
  if (start.getTime() === end.getTime()) {
    return formatDay(end);
  }
  if (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth()
  ) {
    return `${start.getUTCDate()}–${formatDay(end)}`;
  }
  return `${formatDay(start)}–${formatDay(end)}`;
};

const formatMonthYear = (value: Date): string =>
  value.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", year: "numeric" });

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
  next.setUTCDate(next.getUTCDate() - 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
};

const addDays = (value: Date, days: number): Date => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfTrailingYear = (end: Date): Date =>
  new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));

const startOfAllTimeCoverage = (end: Date): Date =>
  new Date(Date.UTC(end.getUTCFullYear() - 2, 0, 1));

const startOfWeekBucketRange = (
  end: Date,
  buckets: number,
): { start: Date; endWeekStart: Date } => {
  const endWeekStart = startOfWeek(end);
  const start = addDays(endWeekStart, -7 * (buckets - 1));
  return { start, endWeekStart };
};

const getTimeframeOption = (timeframe: ReportTimeframe) =>
  TIMEFRAME_OPTIONS.find((option) => option.id === timeframe) ??
  TIMEFRAME_OPTIONS[0];

const getReportHeaderRange = (
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
  const yearLabel = `${allTimeStart.getUTCFullYear()} – ${clampedEnd.getUTCFullYear()}`;
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

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
};

const startOfWeek = (date: Date): Date => {
  const next = startOfDay(date);
  const day = next.getUTCDay();
  const diff = (day + 6) % 7;
  next.setUTCDate(next.getUTCDate() - diff);
  return next;
};

const endOfWeek = (date: Date): Date => {
  const next = startOfWeek(date);
  next.setUTCDate(next.getUTCDate() + 6);
  return endOfDay(next);
};

const startOfMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const endOfMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

const startOfQuarter = (date: Date): Date => {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
};

const endOfQuarter = (date: Date): Date => {
  const quarterStart = startOfQuarter(date);
  return new Date(Date.UTC(
    quarterStart.getUTCFullYear(),
    quarterStart.getUTCMonth() + 3,
    0,
    23,
    59,
    59,
    999,
  ));
};

export const startOfYear = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), 0, 1));

const endOfYear = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));

const resolveSiteFlowWindow = (
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
  const hour = date.getUTCHours().toString().padStart(2, "0");
  return withMinutes ? `${hour}:00` : hour;
};
const formatWeekday = (date: Date): string =>
  date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
const formatMonthDay = (date: Date): string =>
  date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit" });
const formatWeekLabel = (date: Date): string => `Wk of ${formatMonthDay(date)}`;
const formatMonth = (date: Date, withYear = false): string =>
  date.toLocaleDateString("en-US", { timeZone: "UTC",
    month: "short",
    year: withYear ? "numeric" : undefined,
  });
const formatSiteFlowTick = (
  timeframe: string | undefined,
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
      return String(parsed.getUTCFullYear());
    default:
      return label;
  }
};

const inferSiteFlowBucket = (
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
const resolveSiteFlowSliceCount = (
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
      ? elapsedDayBuckets(anchor, length)
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
const buildAnchoredTimestamps = (
  timeframe: ReportTimeframe,
  anchor: Date,
  length: number,
): Date[] => {
  const periods: Record<ReportTimeframe, string> = { today: 'today', yesterday: 'yesterday', last_week: 'week', last_month: 'month', last_quarter: 'quarter', last_year: 'year', all_time: 'all_time' };
  return periodBucketTimes(periods[timeframe], anchor.toISOString(), length).map(value => new Date(value));
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
  const { sliceCount } = resolveSiteFlowSliceCount(
    timeframe,
    anchor,
    seriesList,
  );
  const timestamps =
    timeframe === "today"
      ? dayBucketTimes(anchor.toISOString(), sliceCount).map(value => new Date(value))
      : buildAnchoredTimestamps(timeframe, anchor, sliceCount);
  const bucket = inferSiteFlowBucket(timeframe, sliceCount);
  const labels = timestamps.map((timestamp) =>
    formatSiteFlowTick(timeframe, formatDemoTimestamp(timestamp)),
  );
  return { labels, bucket, timestamps, sliceCount };
};
