import { filterDataByControls } from '../rangeUtils';
import { CardControlState } from '../../hooks/useCardControls';
import { ChartData } from '../dataProcessing';
import { GranularityOption, RangePreset, ScopeOption, SegmentOption, CompareOption } from '../../styles/designTokens';

describe('filterDataByControls', () => {
  const buildControls = (rangePreset: RangePreset): CardControlState => ({
    rangePreset,
    customRange: undefined,
    granularity: 'hour' as GranularityOption,
    scope: 'all_cameras' as ScopeOption,
    segments: [] as SegmentOption[],
    compare: 'off' as CompareOption,
  });

  const buildEvent = (timestamp: string): ChartData => ({
    index: 0,
    track_number: 1,
    event: 'entry',
    timestamp,
    sex: 'male',
    age_estimate: '26-45',
    hour: 0,
    day_of_week: 'Monday',
    date: timestamp.split('T')[0],
  });

  it('includes only events within the preset range', () => {
    const now = new Date('2023-01-08T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const data: ChartData[] = [
      buildEvent('2023-01-07T12:00:00.000Z'),
      buildEvent('2022-12-31T12:00:00.000Z'),
    ];

    const result = filterDataByControls(data, buildControls('last_7_days'));
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('2023-01-07T12:00:00.000Z');
    jest.useRealTimers();
  });

  it('falls back to provided custom range when supplied', () => {
    const controls: CardControlState = {
      rangePreset: 'custom',
      customRange: { from: '2023-01-01', to: '2023-01-02' },
      granularity: 'hour',
      scope: 'all_cameras',
      segments: [],
      compare: 'off',
    };

    const data: ChartData[] = [
      buildEvent('2023-01-01T10:00:00.000Z'),
      buildEvent('2023-01-03T10:00:00.000Z'),
    ];

    const result = filterDataByControls(data, controls);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('2023-01-01T10:00:00.000Z');
  });
});
