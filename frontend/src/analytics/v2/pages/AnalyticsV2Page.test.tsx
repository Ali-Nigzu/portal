import { jest } from '@jest/globals';
import renderer, { act } from 'react-test-renderer';
import type { TestRenderer } from 'react-test-renderer';
import type { ChartResult } from '../../schemas/charting';
import type { AnalyticsRunResponse } from '../transport/runAnalytics';
import AnalyticsV2Page, { AnalyticsV2Page as AnalyticsV2PageBase } from './AnalyticsV2Page';
import timeSeriesResult from '../../examples/golden_dashboard_live_flow.json';

type RunAnalyticsModule = typeof import('../transport/runAnalytics');

type MutationModule = typeof import('../../../dashboard/v2/transport/mutateDashboardManifest');

jest.mock('../../components/ChartRenderer', () => ({
  ChartRenderer: ({ result }: { result: ChartResult }) => (
    <div data-testid={`analytics-chart-${result.chartType}`}>{result.chartType}</div>
  ),
}));

const mockRunAnalytics = jest.fn<Promise<AnalyticsRunResponse>, Parameters<RunAnalyticsModule['runAnalyticsQuery']>>();
const mockPinDashboardWidget = jest.fn<
  ReturnType<MutationModule['pinDashboardWidget']>,
  Parameters<MutationModule['pinDashboardWidget']>
>();
const mockUnpinDashboardWidget = jest.fn<
  ReturnType<MutationModule['unpinDashboardWidget']>,
  Parameters<MutationModule['unpinDashboardWidget']>
>();

jest.mock('../transport/runAnalytics', (): RunAnalyticsModule => {
  const { jest: jestRef } = globalThis as typeof globalThis & { jest: typeof jest };
  const actual = jestRef.requireActual('../transport/runAnalytics') as RunAnalyticsModule;
  return {
    ...actual,
    runAnalyticsQuery: (...args: Parameters<RunAnalyticsModule['runAnalyticsQuery']>) =>
      mockRunAnalytics(...args),
  };
});

jest.mock('../../../dashboard/v2/transport/mutateDashboardManifest', (): MutationModule => ({
  pinDashboardWidget: (...args: Parameters<MutationModule['pinDashboardWidget']>) =>
    mockPinDashboardWidget(...args),
  unpinDashboardWidget: (...args: Parameters<MutationModule['unpinDashboardWidget']>) =>
    mockUnpinDashboardWidget(...args),
}));

const { AnalyticsTransportError: MockTransportError } =
  jest.requireMock('../transport/runAnalytics') as RunAnalyticsModule;

const flushEffects = async (times = 3) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe('AnalyticsV2Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the default preset and pins to the dashboard', async () => {
    const chart = timeSeriesResult as unknown as ChartResult;
    mockRunAnalytics.mockResolvedValue({
      result: chart,
      spec: { id: 'spec', chartType: 'composed_time' } as unknown as AnalyticsRunResponse['spec'],
      specHash: 'hash-1',
      mode: 'fixtures',
      diagnostics: { partialData: false },
    });
    mockPinDashboardWidget.mockResolvedValue({
      id: 'dashboard-default',
      orgId: 'client0',
      widgets: [],
      layout: { kpiBand: [], grid: { columns: 12, placements: {} } },
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AnalyticsV2Page
          credentials={{ username: 'client0', password: 'secret' }}
        />,
      );
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalled();

    const pinButtons = tree!
      .root
      .findAll((node: unknown) => {
        const instance = node as { type: unknown; children?: unknown[] };
        return instance.type === 'button' && instance.children?.includes('Pin to dashboard');
      });
    expect(pinButtons).toHaveLength(1);

    await act(async () => {
      await pinButtons[0].props.onClick();
    });

    expect(mockPinDashboardWidget).toHaveBeenCalled();
  });

  it('disables preset controls when transport mode is fixtures', async () => {
    const chart = timeSeriesResult as unknown as ChartResult;
    mockRunAnalytics.mockResolvedValue({
      result: chart,
      spec: { id: 'spec', chartType: 'composed_time' } as unknown as AnalyticsRunResponse['spec'],
      specHash: 'hash-2',
      mode: 'fixtures',
      diagnostics: { partialData: false },
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AnalyticsV2PageBase
          credentials={{ username: 'client0', password: 'secret' }}
          transportModeOverride="fixtures"
        />,
      );
    });
    await flushEffects();

    const controlButtons = tree!
      .root
      .findAll((node: unknown) => {
        const instance = node as { type?: unknown; props?: { className?: string } };
        return instance.type === 'button' && Boolean(instance.props?.className?.includes('analyticsV2Chip'));
      });
    expect(controlButtons.length).toBeGreaterThan(0);
    controlButtons.forEach((button) => {
      expect(button.props.disabled).toBe(true);
    });
  });

  it('re-runs the preset when a live time range is selected', async () => {
    const chart = timeSeriesResult as unknown as ChartResult;
    mockRunAnalytics.mockResolvedValue({
      result: chart,
      spec: { id: 'spec', chartType: 'composed_time' } as unknown as AnalyticsRunResponse['spec'],
      specHash: 'hash-3',
      mode: 'live',
      diagnostics: { partialData: false },
    });

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AnalyticsV2PageBase
          credentials={{ username: 'client0', password: 'secret' }}
          transportModeOverride="live"
        />,
      );
    });
    await flushEffects();
    expect(mockRunAnalytics).toHaveBeenCalledTimes(1);

    const timeRangeButton = tree!
      .root
      .find((node: unknown) => {
        const instance = node as { type?: unknown; props?: { children?: unknown } };
        return (
          instance.type === 'button' &&
          Array.isArray(instance.props?.children) &&
          instance.props.children.includes('Last 7 days')
        );
      });

    await act(async () => {
      timeRangeButton.props.onClick();
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(2);
  });

  it('renders an error state when analytics transport fails', async () => {
    mockRunAnalytics.mockRejectedValue(new MockTransportError('NETWORK', 'network failure'));

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AnalyticsV2PageBase credentials={{ username: 'client0', password: 'secret' }} />,
      );
    });
    await flushEffects();

    const errorNodes = tree!
      .root
      .findAll((node: unknown) => {
        const instance = node as { props?: { className?: string } };
        return typeof instance.props?.className === 'string' && instance.props.className.includes('analytics-chart-error');
      });
    expect(errorNodes.length).toBeGreaterThan(0);
  });
});
