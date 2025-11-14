import renderer from 'react-test-renderer';
import type { ChartResult } from '../../schemas/charting';
import { SeriesLegendSummary } from './SeriesLegendSummary';

describe('SeriesLegendSummary', () => {
  const result: ChartResult = {
    chartType: 'composed_time',
    xDimension: { id: 'timestamp', type: 'time', bucket: 'HOUR', timezone: 'UTC' },
    series: [
      {
        id: 'entries',
        label: 'Entries',
        geometry: 'line',
        unit: 'people',
        data: [{ x: '2024-01-01T00:00:00Z', y: 4 }],
      },
      {
        id: 'exits',
        label: 'Exits',
        geometry: 'line',
        unit: 'people',
        data: [{ x: '2024-01-01T00:00:00Z', y: 3 }],
      },
    ],
    meta: { timezone: 'UTC' },
  };

  it('reflects visibility map provided by ChartRenderer', () => {
    const tree = renderer.create(
      <SeriesLegendSummary result={result} visibility={{ entries: true, exits: false }} />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Visible');
    expect(json).toContain('Hidden');
  });
});
