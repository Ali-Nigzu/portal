import type { TimeBucket, TimeWindow } from "../analytics/schemas/charting";
export type SiteFlowTimeframe =
  | "today"
  | "yesterday"
  | "last_week"
  | "last_month"
  | "last_quarter"
  | "last_year"
  | "all_time";
export const SITE_FLOW_TIMEFRAME_OPTIONS: Array<{
  value: SiteFlowTimeframe;
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_week", label: "Last Week" },
  { value: "last_month", label: "Last Month" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "last_year", label: "Last Year" },
  { value: "all_time", label: "All Time" },
];
const addDays = (date: Date, days: number, timezone?: string): Date => {
  const next = new Date(date);
  if (timezone === "UTC") {
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }
  next.setDate(next.getDate() + days);
  return next;
};
const addMonths = (date: Date, months: number, timezone?: string): Date => {
  if (timezone === "UTC") {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + months,
        1,
        0,
        0,
        0,
        0,
      ),
    );
  }
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
};
const startOfDay = (date: Date, timezone?: string): Date => {
  if (timezone === "UTC") {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};
const endOfDay = (date: Date, timezone?: string): Date => {
  if (timezone === "UTC") {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};
const startOfWeek = (date: Date, timezone?: string): Date => {
  const start = startOfDay(date, timezone);
  if (timezone === "UTC") {
    const day = start.getUTCDay();
    const diff = (day + 6) % 7;
    return addDays(start, -diff, timezone);
  }
  const day = start.getDay();
  const diff = (day + 6) % 7;
  return addDays(start, -diff, timezone);
};
const endOfWeek = (date: Date, timezone?: string): Date => {
  const start = startOfWeek(date, timezone);
  return endOfDay(addDays(start, 6, timezone), timezone);
};
const startOfMonth = (date: Date, timezone?: string): Date => {
  if (timezone === "UTC") {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0),
    );
  }
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
};
const endOfMonth = (date: Date, timezone?: string): Date => {
  if (timezone === "UTC") {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
  }
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};
const startOfYear = (date: Date, timezone?: string): Date => {
  if (timezone === "UTC") {
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  }
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
};
const endOfYear = (date: Date, timezone?: string): Date => {
  if (timezone === "UTC") {
    return new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
  }
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
};
export const resolveSiteFlowTimeRange = (
  timeframe: SiteFlowTimeframe,
  timezone?: string,
  anchor: Date = new Date(),
): Pick<TimeWindow, "from" | "to"> => {
  switch (timeframe) {
    case "today": {
      const from = startOfDay(anchor, timezone).toISOString();
      const to = endOfDay(anchor, timezone).toISOString();
      return { from, to };
    }
    case "yesterday": {
      const yesterday = addDays(anchor, -1, timezone);
      const from = startOfDay(yesterday, timezone).toISOString();
      const to = endOfDay(yesterday, timezone).toISOString();
      return { from, to };
    }
    case "last_week": {
      const currentWeekStart = startOfWeek(anchor, timezone);
      const previousWeekStart = addDays(currentWeekStart, -7, timezone);
      const from = previousWeekStart.toISOString();
      const to = endOfWeek(previousWeekStart, timezone).toISOString();
      return { from, to };
    }
    case "last_month": {
      const mostRecentMonday = startOfWeek(anchor, timezone);
      const from = addDays(mostRecentMonday, -7 * 3, timezone).toISOString();
      const to = endOfWeek(mostRecentMonday, timezone).toISOString();
      return { from, to };
    }
    case "last_quarter": {
      const mostRecentMonday = startOfWeek(anchor, timezone);
      const from = addDays(mostRecentMonday, -7 * 11, timezone).toISOString();
      const to = endOfWeek(mostRecentMonday, timezone).toISOString();
      return { from, to };
    }
    case "last_year": {
      const endMonthStart = addMonths(startOfMonth(anchor, timezone), -1, timezone);
      const from = addMonths(endMonthStart, -11, timezone).toISOString();
      const to = endOfMonth(endMonthStart, timezone).toISOString();
      return { from, to };
    }
    case "all_time":
    default: {
      const epoch = new Date(0);
      const from = startOfYear(epoch, timezone).toISOString();
      const to = endOfYear(anchor, timezone).toISOString();
      return { from, to };
    }
  }
};
export const bucketForSiteFlowTimeframe = (
  timeframe: SiteFlowTimeframe,
): TimeBucket => {
  switch (timeframe) {
    case "today":
    case "yesterday":
      return "HOUR";
    case "last_week":
      return "DAY";
    case "last_month":
    case "last_quarter":
      return "WEEK";
    case "last_year":
      return "MONTH";
    case "all_time":
    default:
      return "YEAR";
  }
};
