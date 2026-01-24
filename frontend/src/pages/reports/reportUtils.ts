import { resolveSiteFlowWindow } from "../../dashboard/v2/utils/siteFlowBuckets";

export type ReportTimeframe =
  | "today"
  | "yesterday"
  | "last_week"
  | "last_month"
  | "last_quarter"
  | "last_year"
  | "all_time";

export const TIMEFRAME_OPTIONS: Array<{ id: ReportTimeframe; label: string; rollupIndex: number }> = [
  { id: "today", label: "Today", rollupIndex: 0 },
  { id: "yesterday", label: "Yesterday", rollupIndex: 1 },
  { id: "last_week", label: "Last Week", rollupIndex: 2 },
  { id: "last_month", label: "Last Month", rollupIndex: 3 },
  { id: "last_quarter", label: "Last Quarter", rollupIndex: 4 },
  { id: "last_year", label: "Last Year", rollupIndex: 5 },
  { id: "all_time", label: "All Time", rollupIndex: 6 },
];

export const AGE_BUCKET_LABELS = ["0-4", "5-13", "14-25", "26-45", "46-65", "66+"];
export const SEX_BUCKET_LABELS = ["Male", "Female"];
export const RACE_BUCKET_LABELS = ["Light", "Mix", "Dark"];

const toNumberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.map((item) => (typeof item === "number" ? item : 0)) : [];

const sum = (values: number[]): number => values.reduce((acc, value) => acc + value, 0);

const mean = (values: number[]): number => (values.length ? sum(values) / values.length : 0);

const min = (values: number[]): number => (values.length ? Math.min(...values) : 0);

const max = (values: number[]): number => (values.length ? Math.max(...values) : 0);

const clampEnd = (snapshotTs: Date, now: Date): Date =>
  snapshotTs.getTime() <= now.getTime() ? snapshotTs : now;

const collapseIfInverted = (start: Date, end: Date): { start: Date; end: Date } =>
  end.getTime() < start.getTime() ? { start: end, end } : { start, end };

const formatDay = (value: Date): string =>
  value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const formatTime = (value: Date): string =>
  value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

const formatDayRange = (start: Date, end: Date): string => {
  if (start.getTime() === end.getTime()) {
    return formatDay(end);
  }
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
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

export const getTimeframeOption = (timeframe: ReportTimeframe) =>
  TIMEFRAME_OPTIONS.find((option) => option.id === timeframe) ?? TIMEFRAME_OPTIONS[0];

export const resolveRollup = (payload: unknown[], timeframe: ReportTimeframe): unknown[] => {
  if (!Array.isArray(payload)) {
    return [];
  }
  const rollups = Array.isArray(payload[7]) ? payload[7] : [];
  const rollupIndex = getTimeframeOption(timeframe).rollupIndex;
  const rollup = Array.isArray(rollups[rollupIndex]) ? rollups[rollupIndex] : [];
  return rollup as unknown[];
};

export const getReportHeaderRange = (
  timeframe: ReportTimeframe,
  snapshotTs: Date,
  now: Date = new Date(),
): { start: Date; end: Date; labelLine: string } => {
  const end = clampEnd(snapshotTs, now);
  const window = resolveSiteFlowWindow(timeframe, end);
  const { start, end: clampedEnd } = collapseIfInverted(window.from, end);

  if (timeframe === "today") {
    return { start, end: clampedEnd, labelLine: `${formatDay(clampedEnd)} up to ${formatTime(clampedEnd)}` };
  }

  if (timeframe === "yesterday") {
    return { start, end: clampedEnd, labelLine: formatDay(clampedEnd) };
  }

  if (timeframe === "last_week" || timeframe === "last_month") {
    return { start, end: clampedEnd, labelLine: formatDayRange(start, clampedEnd) };
  }

  if (timeframe === "last_quarter" || timeframe === "last_year") {
    return { start, end: clampedEnd, labelLine: formatMonthRange(start, clampedEnd) };
  }

  return { start, end: clampedEnd, labelLine: formatDayRange(start, clampedEnd) };
};

export const formatReportDateRange = (
  snapshotTs: Date,
  timeframe: ReportTimeframe,
  now: Date = new Date(),
): { label: string; subtitle: string; start: Date; end: Date } => {
  const { label } = getTimeframeOption(timeframe);
  const { start, end, labelLine } = getReportHeaderRange(timeframe, snapshotTs, now);
  return { label, subtitle: `${label} • ${labelLine}`, start, end };
};

export interface SiteActivityMetrics {
  entrancesSeries: number[];
  exitsSeries: number[];
  occupancySeries: number[];
  dwellSeries: number[];
  totalEntrances: number;
  totalExits: number;
  netFlow: number;
  peakEntrancesBucket: number;
  peakExitsBucket: number;
  peakOccupancyBucket: number;
  occupancyMin: number;
  occupancyMax: number;
  occupancyAvg: number;
  dwellAvg: number;
  dwellMax: number;
}

export const buildSiteActivityMetrics = (rollup: unknown[]): SiteActivityMetrics => {
  const entrancesSeries = toNumberArray(rollup?.[0]);
  const exitsSeries = toNumberArray(rollup?.[1]);
  const occupancySeries = toNumberArray(rollup?.[2]);
  const dwellSeries = toNumberArray(rollup?.[4]);

  const totalEntrances = sum(entrancesSeries);
  const totalExits = sum(exitsSeries);
  const netFlow = totalEntrances - totalExits;

  const peakEntrancesBucket = entrancesSeries.length
    ? entrancesSeries.indexOf(max(entrancesSeries))
    : 0;
  const peakExitsBucket = exitsSeries.length ? exitsSeries.indexOf(max(exitsSeries)) : 0;
  const peakOccupancyBucket = occupancySeries.length
    ? occupancySeries.indexOf(max(occupancySeries))
    : 0;

  const occupancyMin = min(occupancySeries);
  const occupancyMax = max(occupancySeries);
  const occupancyAvg = occupancySeries.length ? Math.round(mean(occupancySeries)) : 0;
  const dwellAvg = dwellSeries.length ? Math.round(mean(dwellSeries)) : 0;
  const dwellMax = max(dwellSeries);

  return {
    entrancesSeries,
    exitsSeries,
    occupancySeries,
    dwellSeries,
    totalEntrances,
    totalExits,
    netFlow,
    peakEntrancesBucket,
    peakExitsBucket,
    peakOccupancyBucket,
    occupancyMin,
    occupancyMax,
    occupancyAvg,
    dwellAvg,
    dwellMax,
  };
};

export interface VisitorProfileMetrics {
  agePct: number[];
  sexPct: number[];
  racePct: number[];
  totalEntrances: number;
  dominantAgeBucket: string;
  sexSplit: { Male: number; Female: number };
  raceSplit: { Light: number; Mix: number; Dark: number };
}

export const buildVisitorProfileMetrics = (rollup: unknown[]): VisitorProfileMetrics => {
  const entrancesSeries = toNumberArray(rollup?.[0]);
  const agePct = toNumberArray(rollup?.[5]);
  const sexPct = toNumberArray(rollup?.[6]);
  const racePct = toNumberArray(rollup?.[7]);

  const totalEntrances = sum(entrancesSeries);
  const dominantAgeIndex = agePct.length ? agePct.indexOf(max(agePct)) : 0;

  return {
    agePct,
    sexPct,
    racePct,
    totalEntrances,
    dominantAgeBucket: AGE_BUCKET_LABELS[dominantAgeIndex] ?? AGE_BUCKET_LABELS[0],
    sexSplit: {
      Male: sexPct[0] ?? 0,
      Female: sexPct[1] ?? 0,
    },
    raceSplit: {
      Light: racePct[0] ?? 0,
      Mix: racePct[1] ?? 0,
      Dark: racePct[2] ?? 0,
    },
  };
};
