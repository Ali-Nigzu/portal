import { resolveSiteFlowWindow, startOfWeek } from "../../../lib/timeWindows";

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
export const RACE_BUCKET_LABELS = ["Light", "Mix", "Dark"];

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
