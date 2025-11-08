import { useMemo } from 'react';
import { ChartData } from '../utils/dataProcessing';
import { GranularityOption, IntelligencePayload } from '../types/analytics';

type CanonicalGranularity = '5m' | '15m' | 'hour' | 'day' | 'week';

export interface NormalizedChartPoint {
  label: string;
  bucketStart: string;
  entries: number;
  exits: number;
  activity: number;
  occupancy: number;
  hourOfDay?: number;
  isPeak?: boolean;
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

const normalizeGranularity = (value?: string): CanonicalGranularity => {
  if (!value) {
    return 'hour';
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('5')) {
    return '5m';
  }
  if (normalized.includes('15')) {
    return '15m';
  }
  if (normalized.includes('week')) {
    return 'week';
  }
  if (normalized.includes('day')) {
    return 'day';
  }
  return 'hour';
};

const getRecommendedGranularity = (
  data: ChartData[],
  intelligence?: IntelligencePayload | null
): CanonicalGranularity => {
  if (intelligence?.optimal_granularity) {
    return normalizeGranularity(intelligence.optimal_granularity);
  }

  if (!data.length) {
    return 'hour';
  }

  const timestamps = data
    .map(item => new Date(item.timestamp).getTime())
    .filter(time => !Number.isNaN(time))
    .sort((a, b) => a - b);

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const spanMinutes = (last - first) / (1000 * 60);

  if (spanMinutes <= 12 * 60) {
    return '5m';
  }
  if (spanMinutes <= 48 * 60) {
    return '15m';
  }
  if (spanMinutes <= 14 * 24 * 60) {
    return 'hour';
  }
  if (spanMinutes <= 60 * 24 * 60) {
    return 'day';
  }

  return 'week';
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

export const useChartData = (
  data: ChartData[],
  userGranularity: GranularityOption,
  intelligence?: IntelligencePayload | null
): UseChartDataResult => {
  return useMemo(() => {
    const recommended = getRecommendedGranularity(data, intelligence);
    const activeCanonical = userGranularity === 'auto' ? recommended : canonicalGranularity(userGranularity);

    if (!data.length) {
      return {
        series: [],
        activeGranularity: activeCanonical,
        recommendedGranularity: recommended,
        highlightBuckets: [],
        averageOccupancy: 0,
        totalActivity: 0
      };
    }

    const sortedEvents = [...data].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const bucketsMap = new Map<string, NormalizedChartPoint & { startDate: Date }>();

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
          hourOfDay: activeCanonical === 'hour' ? bucketStart.getHours() : undefined,
          startDate: bucketStart
        });
      }

      const bucket = bucketsMap.get(bucketKey)!;
      bucket.activity += 1;
      if (item.event === 'entry') {
        bucket.entries += 1;
      } else if (item.event === 'exit') {
        bucket.exits += 1;
      }
    });

    const series: NormalizedChartPoint[] = Array.from(bucketsMap.values())
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map(bucket => ({
        label: bucket.label,
        bucketStart: bucket.bucketStart,
        entries: bucket.entries,
        exits: bucket.exits,
        activity: bucket.activity,
        occupancy: 0,
        hourOfDay: bucket.hourOfDay,
        isPeak: false
      }));

    let runningOccupancy = 0;
    series.forEach(point => {
      runningOccupancy += point.entries - point.exits;
      point.occupancy = Math.max(0, runningOccupancy);
    });

    const totalActivity = series.reduce((sum, point) => sum + point.activity, 0);
    const averageOccupancy = series.length
      ? series.reduce((sum, point) => sum + point.occupancy, 0) / series.length
      : 0;

    const highlightBucketsSet = new Set<string>();
    if (intelligence?.peak_hours?.length && activeCanonical === 'hour') {
      const peakSet = new Set(
        intelligence.peak_hours.map(hour => Number(hour)).filter(hour => !Number.isNaN(hour))
      );
      series.forEach(point => {
        if (point.hourOfDay !== undefined && peakSet.has(point.hourOfDay)) {
          point.isPeak = true;
          highlightBucketsSet.add(point.label);
        }
      });
    } else {
      const maxActivity = Math.max(...series.map(point => point.activity));
      series.forEach(point => {
        if (point.activity === maxActivity) {
          point.isPeak = true;
          highlightBucketsSet.add(point.label);
        }
      });
    }

    return {
      series,
      activeGranularity: activeCanonical,
      recommendedGranularity: recommended,
      highlightBuckets: Array.from(highlightBucketsSet),
      averageOccupancy,
      totalActivity
    };
  }, [data, userGranularity, intelligence]);
};

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
