import type { ReactNode } from 'react';
import renderer from 'react-test-renderer';
import type { ChartResult } from '../../../schemas/charting';
import retentionHeatmap from '../../../examples/golden_retention_heatmap.json';
import { ChartRenderer } from '../ChartRenderer';

jest.mock('recharts/lib/component/ResponsiveContainer', () => {
  const ResponsiveContainer = ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  );
  return { ResponsiveContainer, default: ResponsiveContainer };
});

beforeAll(() => {
  class ResizeObserverMock {
    observe() {
      // no-op
    }
    unobserve() {
      // no-op
    }
    disconnect() {
      // no-op
    }
  }
  // @ts-expect-error jsdom test environment does not ship ResizeObserver
  global.ResizeObserver = ResizeObserverMock;
  Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      x: 0,
      y: 0,
      toJSON() {
        return '';
      },
    }),
  });
});

const baseTimeResult: ChartResult = {
  chartType: 'composed_time',
  xDimension: { id: 'timestamp', type: 'time', bucket: 'HOUR', timezone: 'UTC' },
  series: [
    {
      id: 'entries',
      label: 'Entries',
      geometry: 'line',
      unit: 'people',
      data: [
        { x: '2024-01-01T00:00:00Z', y: 10, coverage: 1 },
        { x: '2024-01-01T01:00:00Z', y: 12, coverage: 0.9 },
      ],
    },
  ],
  meta: { timezone: 'UTC' },
};

describe('ChartRenderer high-level states', () => {
  it('shows ChartErrorState for invalid specs', () => {
    const invalid: ChartResult = { ...baseTimeResult, series: [] };
    const tree = renderer.create(<ChartRenderer result={invalid} height={300} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Unable to render chart');
  });

  it('shows ChartEmptyState when all data points are null', () => {
    const emptyResult: ChartResult = {
      ...baseTimeResult,
      series: [
        {
          ...baseTimeResult.series[0],
          data: [
            { x: '2024-01-01T00:00:00Z', y: null },
            { x: '2024-01-01T01:00:00Z', y: null },
          ],
        },
      ],
    };
    const tree = renderer.create(<ChartRenderer result={emptyResult} height={300} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Nothing to display yet');
  });

  it('renders KPI tiles for single value presets', () => {
    const kpiResult: ChartResult = {
      chartType: 'single_value',
      xDimension: { id: 'timestamp', type: 'time', bucket: 'DAY', timezone: 'UTC' },
      series: [
        {
          id: 'dwell_avg',
          label: 'Avg dwell',
          geometry: 'line',
          unit: 'minutes',
          data: [
            { x: '2024-01-01', value: 2.3, coverage: 0.9 },
            { x: '2024-01-02', value: 2.1, coverage: 0.95 },
          ],
          summary: { delta: 0.1 },
        },
      ],
      meta: { timezone: 'UTC' },
    };

    const tree = renderer.create(<ChartRenderer result={kpiResult} height={200} />);
    const kpiValue = tree.root.findAll(
      (node) => node.props?.className === 'kpi-value',
    )[0];
    expect(kpiValue?.children?.join('')).toContain('2');
  });

  it('renders the retention heatmap fixture without error', () => {
    let tree: ReturnType<typeof renderer.create> | undefined;
    expect(() => {
      tree = renderer.create(<ChartRenderer result={retentionHeatmap as ChartResult} height={360} />);
    }).not.toThrow();
    expect(JSON.stringify(tree!.toJSON())).not.toContain('Unable to render chart');
  });
});
