import { CardControlState } from '../hooks/useCardControls';
import { RangePreset } from '../styles/designTokens';
import { ChartData } from './dataProcessing';

export interface DateRange {
  from: Date;
  to: Date;
}

const clampRange = (range: DateRange): DateRange => {
  if (range.from > range.to) {
    return { from: range.to, to: range.from };
  }
  return range;
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const startOfWeek = (date: Date) => {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  next.setDate(next.getDate() + diff);
  return next;
};

const endOfWeek = (date: Date) => {
  const start = startOfWeek(date);
  start.setDate(start.getDate() + 6);
  start.setHours(23, 59, 59, 999);
  return start;
};

const startOfMonth = (date: Date) => {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
};

const endOfMonth = (date: Date) => {
  const next = startOfMonth(date);
  next.setMonth(next.getMonth() + 1);
  next.setMilliseconds(-1);
  return next;
};

const startOfYear = (date: Date) => {
  const next = startOfDay(date);
  next.setMonth(0, 1);
  return next;
};

const endOfYear = (date: Date) => {
  const next = startOfYear(date);
  next.setFullYear(next.getFullYear() + 1);
  next.setMilliseconds(-1);
  return next;
};

export const getRangeFromPreset = (preset: RangePreset, custom?: { from?: string; to?: string }): DateRange => {
  const now = new Date();
  const end = new Date(now);

  switch (preset) {
    case 'last_2_days':
      return clampRange({ from: new Date(end.getTime() - 2 * 24 * 60 * 60 * 1000), to: end });
    case 'last_7_days':
      return clampRange({ from: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000), to: end });
    case 'last_30_days':
      return clampRange({ from: new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000), to: end });
    case 'last_12_weeks':
      return clampRange({ from: new Date(end.getTime() - 12 * 7 * 24 * 60 * 60 * 1000), to: end });
    case 'last_6_months': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 6);
      return clampRange({ from, to: now });
    }
    case 'last_12_months': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 12);
      return clampRange({ from, to: now });
    }
    case 'today':
      return clampRange({ from: startOfDay(now), to: endOfDay(now) });
    case 'yesterday': {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return clampRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
    }
    case 'this_week':
      return clampRange({ from: startOfWeek(now), to: endOfWeek(now) });
    case 'this_month':
      return clampRange({ from: startOfMonth(now), to: endOfMonth(now) });
    case 'this_year':
      return clampRange({ from: startOfYear(now), to: endOfYear(now) });
    case 'previous_week': {
      const start = startOfWeek(now);
      start.setDate(start.getDate() - 7);
      const endWeek = endOfWeek(start);
      return clampRange({ from: start, to: endWeek });
    }
    case 'previous_month': {
      const start = startOfMonth(now);
      start.setMonth(start.getMonth() - 1);
      const endMonth = endOfMonth(start);
      return clampRange({ from: start, to: endMonth });
    }
    case 'last_hour':
      return clampRange({ from: new Date(now.getTime() - 60 * 60 * 1000), to: now });
    case 'last_3_hours':
      return clampRange({ from: new Date(now.getTime() - 3 * 60 * 60 * 1000), to: now });
    case 'last_6_hours':
      return clampRange({ from: new Date(now.getTime() - 6 * 60 * 60 * 1000), to: now });
    case 'last_12_hours':
      return clampRange({ from: new Date(now.getTime() - 12 * 60 * 60 * 1000), to: now });
    case 'last_24_hours':
      return clampRange({ from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now });
    case 'last_48_hours':
      return clampRange({ from: new Date(now.getTime() - 48 * 60 * 60 * 1000), to: now });
    case 'custom': {
      if (custom?.from && custom?.to) {
        const fromDate = new Date(custom.from);
        const toDate = new Date(custom.to);
        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
          return clampRange({ from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now });
        }
        const hasExplicitTime = custom.from.includes('T') || custom.to.includes('T');
        return clampRange({ from: fromDate, to: hasExplicitTime ? toDate : endOfDay(toDate) });
      }
      return clampRange({ from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now });
    }
    default:
      return clampRange({ from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now });
  }
};

export const filterDataByControls = (data: ChartData[], controls: CardControlState): ChartData[] => {
  const range = getRangeFromPreset(controls.rangePreset, controls.customRange);
  return data.filter(item => {
    const timestamp = new Date(item.timestamp).getTime();
    if (Number.isNaN(timestamp)) {
      return false;
    }
    return timestamp >= range.from.getTime() && timestamp <= range.to.getTime();
  });
};

export const getDateRangeFromPreset = (
  preset: RangePreset,
  custom?: { from?: string; to?: string },
): DateRange => getRangeFromPreset(preset, custom);
