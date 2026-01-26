const DAY_MS = 24 * 60 * 60 * 1000;

export type TimeWindowKey =
  | 'today'
  | 'yesterday'
  | 'last_week'
  | 'last_month'
  | 'last_quarter'
  | 'last_year'
  | 'all_time';

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

export const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

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
  timeframe: TimeWindowKey,
  anchor: Date,
): { from: Date; to: Date } => {
  switch (timeframe) {
    case 'today':
      return { from: startOfDay(anchor), to: anchor };
    case 'yesterday': {
      const yesterday = new Date(anchor.getTime() - DAY_MS);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case 'last_week':
      return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
    case 'last_month':
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case 'last_quarter':
      return { from: startOfQuarter(anchor), to: endOfQuarter(anchor) };
    case 'last_year':
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case 'all_time':
    default:
      return { from: startOfYear(anchor), to: anchor };
  }
};
