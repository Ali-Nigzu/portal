import { useMemo } from 'react';
import { ChartData, MAX_SESSION_WINDOW_MINUTES } from '../utils/dataProcessing';
import { GranularityOption, IntelligencePayload } from '../types/analytics';

type CanonicalGranularity = '5m' | '15m' | 'hour' | 'day' | 'week';

export interface NormalizedChartPoint {
  label: string;
  bucketStart: string;
  entries: number;
  exits: number;
  activity: number;
  occupancy: number;
  bucketMinutes: number;
  hourOfDay?: number;
  zScore?: number;
  dwellMean: number;
}

export interface UseChartDataResult {
  series: NormalizedChartPoint[];
  activeGranularity: GranularityOption;
  recommendedGranularity: GranularityOption;
  highlightBuckets: string[];
  averageOccupancy: number;
  totalActivity: number;
}

const GRANULARITY_ORDER: CanonicalGranularity[] = ['5m', '15m', 'hour', 'day', 'week'];

const canonicalGranularity = (value: GranularityOption): CanonicalGranularity => {
  switch (value) {
    case '5m':
    case '15m':
    case 'hour':
    case 'day':
    case 'week':
      return value;
    case 'hourly':
      return 'hour';
    case 'daily':
      return 'day';
    case 'weekly':
      return 'week';
    default:
      return 'hour';
  }
};

const startOfDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const startOfWeek = (date: Date) => {
  const normalized = startOfDay(date);
  const day = normalized.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // align to Monday as start of week
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
};

const formatLabel = (date: Date, granularity: CanonicalGranularity) => {
  if (granularity === '5m' || granularity === '15m' || granularity === 'hour') {
    const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const hour = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${hour}:${minutes}`;
  }

  if (granularity === 'day') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  if (granularity === 'week') {
    const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `Week of ${day}`;
  }

  return date.toLocaleDateString();
};

const getBucketStart = (date: Date, granularity: CanonicalGranularity): Date => {
  if (granularity === '5m' || granularity === '15m') {
    const normalized = new Date(date);
    normalized.setSeconds(0, 0);
    const interval = granularity === '5m' ? 5 : 15;
    const minutes = normalized.getMinutes();
    normalized.setMinutes(minutes - (minutes % interval), 0, 0);
    return normalized;
  }

  if (granularity === 'hour') {
    const normalized = new Date(date);
    normalized.setMinutes(0, 0, 0);
    return normalized;
  }

  if (granularity === 'day') {
    return startOfDay(date);
  }

  if (granularity === 'week') {
    return startOfWeek(date);
  }

  return new Date(date);
};

const sortGranularity = (granularity: GranularityOption): number => {
  if (granularity === 'auto') {
    return 0;
  }
  return GRANULARITY_ORDER.indexOf(canonicalGranularity(granularity)) + 1;
};

const bucketMinutesForGranularity = (granularity: CanonicalGranularity): number => {
  switch (granularity) {
    case '5m':
      return 5;
    case '15m':
      return 15;
    case 'hour':
      return 60;
    case 'day':
      return 60 * 24;
    case 'week':
      return 60 * 24 * 7;
    default:
      return 60;
  }
};

interface BucketAccumulator extends NormalizedChartPoint {
  startDate: Date;
  dwellTotal: number;
  dwellSamples: number;
}

const buildSeriesForGranularity = (
  sortedEvents: ChartData[],
  activeCanonical: CanonicalGranularity,
): NormalizedChartPoint[] => {
  const activeEntries = new Map<number, Date>();
  const bucketsMap = new Map<
    string,
    BucketAccumulator
  >();

  sortedEvents.forEach(item => {
    const eventTime = new Date(item.timestamp);
    if (Number.isNaN(eventTime.getTime())) {
      return;
    }

    const bucketStart = getBucketStart(eventTime, activeCanonical);
    const bucketKey = bucketStart.toISOString();

    if (!bucketsMap.has(bucketKey)) {
      bucketsMap.set(bucketKey, {
        label: formatLabel(bucketStart, activeCanonical),
        bucketStart: bucketStart.toISOString(),
        entries: 0,
        exits: 0,
        activity: 0,
        occupancy: 0,
        bucketMinutes: bucketMinutesForGranularity(activeCanonical),
        hourOfDay: activeCanonical === 'hour' ? bucketStart.getHours() : undefined,
        zScore: 0,
        startDate: bucketStart,
        dwellMean: 0,
        dwellTotal: 0,
        dwellSamples: 0,
      });
    }

    const bucket = bucketsMap.get(bucketKey)!;
    bucket.activity += 1;
    if (item.event === 'entry') {
      bucket.entries += 1;
      activeEntries.set(item.track_number, eventTime);
    } else if (item.event === 'exit') {
      bucket.exits += 1;
      const entryTime = activeEntries.get(item.track_number);
      if (entryTime) {
        const dwellMinutes = (eventTime.getTime() - entryTime.getTime()) / (1000 * 60);
        if (dwellMinutes >= 0 && dwellMinutes <= MAX_SESSION_WINDOW_MINUTES) {
          bucket.dwellTotal += dwellMinutes;
          bucket.dwellSamples += 1;
        }
        activeEntries.delete(item.track_number);
      }
    }
  });

  const series = Array.from(bucketsMap.values()).sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

  let runningOccupancy = 0;
  series.forEach(point => {
    runningOccupancy += point.entries - point.exits;
    point.occupancy = Math.max(0, runningOccupancy);
    point.dwellMean = point.dwellSamples > 0 ? point.dwellTotal / point.dwellSamples : 0;
  });

  const activityValues = series.map(point => point.activity);
  const mean = activityValues.length
    ? activityValues.reduce((sum, value) => sum + value, 0) / activityValues.length
    : 0;
  const variance = activityValues.length
    ? activityValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / activityValues.length
    : 0;
  const stddev = Math.sqrt(variance);

  series.forEach(point => {
    if (stddev > 0) {
      point.zScore = (point.activity - mean) / stddev;
    } else {
      point.zScore = 0;
    }
  });

  return series.map(point => ({
    label: point.label,
    bucketStart: point.bucketStart,
    entries: point.entries,
    exits: point.exits,
    activity: point.activity,
    occupancy: point.occupancy,
    bucketMinutes: point.bucketMinutes,
    hourOfDay: point.hourOfDay,
    zScore: point.zScore,
    dwellMean: point.dwellMean,
  }));
};

export const computeChartSeries = (
  data: ChartData[],
  userGranularity: GranularityOption,
  _intelligence?: IntelligencePayload | null,
): UseChartDataResult => {
  if (!data.length) {
    return {
      series: [],
      activeGranularity: userGranularity === 'auto' ? 'hour' : canonicalGranularity(userGranularity),
      recommendedGranularity: 'hour',
      highlightBuckets: [],
      averageOccupancy: 0,
      totalActivity: 0,
    };
  }

  const sortedEvents = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const candidateGranularities: CanonicalGranularity[] = ['5m', '15m', 'hour', 'day', 'week'];

  const recommendedFromData = candidateGranularities.find(granularity => {
    const seriesForGranularity = buildSeriesForGranularity(sortedEvents, granularity);
    return seriesForGranularity.length <= 200;
  });

  const recommended = recommendedFromData ?? 'week';
  const activeCanonical = userGranularity === 'auto' ? recommended : canonicalGranularity(userGranularity);
  const series = buildSeriesForGranularity(sortedEvents, activeCanonical);

  const totalActivity = series.reduce((sum, point) => sum + point.activity, 0);
  const averageOccupancy = series.length
    ? series.reduce((sum, point) => sum + point.occupancy, 0) / series.length
    : 0;

  const highlightBuckets = series
    .filter(point => (point.zScore ?? 0) >= 2)
    .map(point => point.label);

  return {
    series,
    activeGranularity: activeCanonical,
    recommendedGranularity: recommended,
    highlightBuckets,
    averageOccupancy,
    totalActivity,
  };
};

export const useChartData = (
  data: ChartData[],
  userGranularity: GranularityOption,
  intelligence?: IntelligencePayload | null,
): UseChartDataResult =>
  useMemo(
    () => computeChartSeries(data, userGranularity, intelligence),
    [data, userGranularity, intelligence],
  );

export const getGranularityOptions = (): { value: GranularityOption; label: string }[] => [
  { value: 'auto', label: 'Auto' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' }
];

export const compareGranularityPriority = (
  a: GranularityOption,
  b: GranularityOption
): number => sortGranularity(a) - sortGranularity(b);
