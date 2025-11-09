import { buildAnalyticsResult, defaultAnalyticsBuilderState, createFilterGroup, createFilterCondition } from '../utils/analyticsBuilder';
import { ChartData } from '../utils/dataProcessing';
import { CardControlState } from '../hooks/useCardControls';

describe('analyticsBuilder integration', () => {
  const baseControls: CardControlState = {
    rangePreset: 'custom',
    customRange: {
      from: '2024-06-10T00:00:00Z',
      to: '2024-06-20T00:00:00Z',
    },
    granularity: 'hour',
    scope: 'all_cameras',
    segments: [],
    compare: 'off',
  };

  const baseData: ChartData[] = [
    {
      index: 0,
      track_number: 1,
      event: 'entry',
      timestamp: '2024-06-10T10:00:00Z',
      sex: 'female',
      age_estimate: '26',
      hour: 10,
      day_of_week: 'Mon',
      date: '2024-06-10',
      camera_id: 'A',
      camera_name: 'Camera A',
      site_id: '1',
      site_name: 'Site 1',
    },
    {
      index: 1,
      track_number: 2,
      event: 'entry',
      timestamp: '2024-06-10T10:05:00Z',
      sex: 'female',
      age_estimate: '34',
      hour: 10,
      day_of_week: 'Mon',
      date: '2024-06-10',
      camera_id: 'A',
      camera_name: 'Camera A',
      site_id: '1',
      site_name: 'Site 1',
    },
    {
      index: 2,
      track_number: 1,
      event: 'exit',
      timestamp: '2024-06-10T10:15:00Z',
      sex: 'female',
      age_estimate: '26',
      hour: 10,
      day_of_week: 'Mon',
      date: '2024-06-10',
      camera_id: 'A',
      camera_name: 'Camera A',
      site_id: '1',
      site_name: 'Site 1',
    },
    {
      index: 3,
      track_number: 2,
      event: 'exit',
      timestamp: '2024-06-10T10:20:00Z',
      sex: 'female',
      age_estimate: '34',
      hour: 10,
      day_of_week: 'Mon',
      date: '2024-06-10',
      camera_id: 'A',
      camera_name: 'Camera A',
      site_id: '1',
      site_name: 'Site 1',
    },
    {
      index: 4,
      track_number: 3,
      event: 'entry',
      timestamp: '2024-06-10T11:00:00Z',
      sex: 'male',
      age_estimate: '28',
      hour: 11,
      day_of_week: 'Mon',
      date: '2024-06-10',
      camera_id: 'A',
      camera_name: 'Camera A',
      site_id: '1',
      site_name: 'Site 1',
    },
    {
      index: 5,
      track_number: 3,
      event: 'exit',
      timestamp: '2024-06-10T11:30:00Z',
      sex: 'male',
      age_estimate: '28',
      hour: 11,
      day_of_week: 'Mon',
      date: '2024-06-10',
      camera_id: 'A',
      camera_name: 'Camera A',
      site_id: '1',
      site_name: 'Site 1',
    },
    {
      index: 6,
      track_number: 4,
      event: 'entry',
      timestamp: '2024-06-16T12:00:00Z',
      sex: 'female',
      age_estimate: '30',
      hour: 12,
      day_of_week: 'Sun',
      date: '2024-06-16',
      camera_id: 'B',
      camera_name: 'Camera B',
      site_id: '1',
      site_name: 'Site 1',
    },
  ];

  it('produces matching totals for flow metrics and KPI parity', () => {
    const builder = {
      ...defaultAnalyticsBuilderState(),
      granularity: 'hour' as const,
      yMetrics: ['activity', 'occupancy', 'avg_dwell'] as const,
      chartType: 'area' as const,
    };

    const result = buildAnalyticsResult(baseData, baseControls, builder, null);

    const totals = result.data.reduce(
      (acc, row) => {
        const activity = Number(row['activity__all'] ?? 0);
        const dwell = Number(row['avg_dwell__all'] ?? 0);
        const occupancy = Number(row['occupancy__all'] ?? 0);
        return {
          activity: acc.activity + activity,
          dwellSamples: [...acc.dwellSamples, dwell],
          lastOccupancy: occupancy,
        };
      },
      { activity: 0, dwellSamples: [] as number[], lastOccupancy: 0 },
    );

    expect(result.data).toHaveLength(3);
    expect(totals.activity).toBe(7);
    expect(totals.lastOccupancy).toBe(1);
    expect(totals.dwellSamples[0]).toBeCloseTo(15, 1);
    expect(totals.dwellSamples[1]).toBeCloseTo(30, 1);
  });

  it('applies nested AND/OR filters with relative time windows', () => {
    const root = createFilterGroup('OR');
    const left = createFilterGroup('AND');
    left.children.push(createFilterCondition('event_type'));
    left.children.push({ ...createFilterCondition('sex'), value: 'female' });

    const right = createFilterGroup('AND');
    right.children.push({ ...createFilterCondition('weekday'), operator: 'in', value: ['Sat', 'Sun'] });
    right.children.push({ ...createFilterCondition('timestamp'), operator: 'relative', value: { preset: 'last_30_days' } });

    root.children.push(left, right);

    const builder = {
      ...defaultAnalyticsBuilderState(),
      xAxis: 'weekday' as const,
      granularity: 'day' as const,
      yMetrics: ['activity'] as const,
      chartType: 'bar' as const,
      filters: root,
    };

    const result = buildAnalyticsResult(baseData, baseControls, builder, null);
    const categories = result.data.map(row => row.category);

    expect(categories).toEqual(expect.arrayContaining(['Mon', 'Sun']));
    expect(categories).not.toContain('Tue');
  });
});
