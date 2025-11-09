import { computeChartSeries } from '../useChartData';
import { ChartData } from '../../utils/dataProcessing';
import { IntelligencePayload } from '../../types/analytics';

describe('computeChartSeries', () => {
  const baseEvent: Omit<ChartData, 'timestamp' | 'event' | 'hour' | 'day_of_week' | 'date'> = {
    index: 0,
    track_number: 1,
    sex: 'male',
    age_estimate: '26-45',
  } as const;

  const buildEvent = (
    overrides: Pick<ChartData, 'timestamp' | 'event' | 'hour' | 'day_of_week' | 'date'>,
  ): ChartData => ({
    ...baseEvent,
    ...overrides,
  });

  it('computes occupancy and totals per bucket', () => {
    const events: ChartData[] = [
      buildEvent({
        timestamp: '2023-01-01T10:00:00.000Z',
        event: 'entry',
        hour: 10,
        day_of_week: 'Sunday',
        date: '2023-01-01',
      }),
      buildEvent({
        timestamp: '2023-01-01T10:05:00.000Z',
        event: 'exit',
        hour: 10,
        day_of_week: 'Sunday',
        date: '2023-01-01',
      }),
      buildEvent({
        timestamp: '2023-01-01T11:00:00.000Z',
        event: 'entry',
        hour: 11,
        day_of_week: 'Sunday',
        date: '2023-01-01',
      }),
      buildEvent({
        timestamp: '2023-01-01T12:30:00.000Z',
        event: 'entry',
        hour: 12,
        day_of_week: 'Sunday',
        date: '2023-01-01',
      }),
    ];

    const result = computeChartSeries(events, 'hour');

    expect(result.series).toHaveLength(3);
    expect(result.series[0]).toMatchObject({ entries: 1, exits: 1, activity: 2, occupancy: 0 });
    expect(result.series[1]).toMatchObject({ entries: 1, exits: 0, activity: 1, occupancy: 1 });
    expect(result.series[2]).toMatchObject({ entries: 1, exits: 0, activity: 1, occupancy: 2 });
    expect(result.totalActivity).toBe(4);
    expect(result.averageOccupancy).toBeCloseTo((0 + 1 + 2) / 3);
  });

  it('highlights peak hours from intelligence payload', () => {
    const events: ChartData[] = [
      buildEvent({
        timestamp: '2023-01-01T09:00:00.000Z',
        event: 'entry',
        hour: 9,
        day_of_week: 'Sunday',
        date: '2023-01-01',
      }),
      buildEvent({
        timestamp: '2023-01-01T09:30:00.000Z',
        event: 'exit',
        hour: 9,
        day_of_week: 'Sunday',
        date: '2023-01-01',
      }),
      buildEvent({
        timestamp: '2023-01-01T10:00:00.000Z',
        event: 'entry',
        hour: 10,
        day_of_week: 'Sunday',
        date: '2023-01-01',
      }),
    ];

    const intelligence: IntelligencePayload = {
      total_records: events.length,
      date_span_days: 1,
      latest_timestamp: '2023-01-01T10:00:00.000Z',
      optimal_granularity: 'hour',
      peak_hours: [10],
      demographics_breakdown: {
        gender: {},
        age_groups: {},
        events: { entry: 0, exit: 0 },
      },
      temporal_patterns: {
        hourly_distribution: {},
        daily_distribution: {},
        peak_times: { hour: 10, count: 1 },
      },
      avg_dwell_minutes: 0,
    };

    const result = computeChartSeries(events, 'auto', intelligence);
    expect(result.activeGranularity).toBe('hour');
    expect(result.highlightBuckets).toHaveLength(1);
    expect(result.series.find(point => point.isPeak)?.label).toBeDefined();
  });
});
