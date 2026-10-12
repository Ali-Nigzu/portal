const QUARTER_HOUR = 900000;
const DAY = 86400000;
export function rollingBucketTimes(ts: string): number[] {
  const end = Math.floor(Date.parse(ts) / QUARTER_HOUR) * QUARTER_HOUR;
  return Array.from({ length: 96 }, (_, i) => end - (95 - i) * QUARTER_HOUR);
}
export function dayBucketTimes(ts: string, length: number, dayOffset = 0): number[] {
  const date = new Date(ts);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + dayOffset * DAY;
  return Array.from({ length }, (_, i) => start + i * 3600000);
}
export function elapsedDayBuckets(ts: Date, available: number): number {
  return Math.min(available, ts.getUTCHours() + 1, 24);
}

// Calendar rollups match the existing Dashboard contract; all consumers share
// the same UTC anchor instead of assigning different dates to identical values.
export function periodBucketTimes(period: string, ts: string, length: number): number[] {
  if (period === 'today' || period === 'yesterday') return dayBucketTimes(ts, length, period === 'yesterday' ? -1 : 0);
  const date = new Date(ts), year = date.getUTCFullYear();
  const midnight = dayBucketTimes(ts, 1)[0];
  const monday = midnight - ((date.getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length }, (_, i) => {
    switch (period) {
      case 'week': return monday + i * DAY;
      case 'month': case 'quarter': return monday - (length - 1 - i) * 7 * DAY;
      case 'year': return Date.UTC(year, i, 1);
      case 'all_time': return Date.UTC(year - length + 1 + i, 0, 1);
      default: throw new Error('Invalid snapshot period');
    }
  });
}
