import { computeChartSeries } from '../useChartData';
import { ChartData } from '../../utils/dataProcessing';

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

  it('computes surge z-scores for activity', () => {
    const events: ChartData[] = [];
    const pushEvent = (hour: number, count: number) => {
      for (let index = 0; index < count; index += 1) {
        events.push(
          buildEvent({
            timestamp: `2023-01-01T${hour.toString().padStart(2, '0')}:00:00.000Z`,
            event: index % 2 === 0 ? 'entry' : 'exit',
            hour,
            day_of_week: 'Sunday',
            date: '2023-01-01',
          }),
        );
      }
    };

    for (let hour = 0; hour < 10; hour += 1) {
      pushEvent(hour, 2);
    }
    pushEvent(10, 200);

    const result = computeChartSeries(events, 'auto');
    const surgePoint = result.series.find(point => (point.zScore ?? 0) >= 2);

    expect(result.activeGranularity).toBe('5m');
    expect(result.highlightBuckets).toContain(surgePoint?.label);
  });
});
