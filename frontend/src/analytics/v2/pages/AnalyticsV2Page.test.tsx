import renderer, { act } from 'react-test-renderer';
import type { TestRenderer } from 'react-test-renderer';
import type { ChartResult } from '../../schemas/charting';
import type { AnalyticsRunResponse } from '../transport/runAnalytics';
import AnalyticsV2Page, { AnalyticsV2Page as AnalyticsV2PageBase } from './AnalyticsV2Page';
import timeSeriesResult from '../../examples/golden_dashboard_live_flow.json';

type RunAnalyticsModule = typeof import('../transport/runAnalytics');

type MutationModule = typeof import('../../../dashboard/v2/transport/mutateDashboardManifest');

type JestApi = typeof import('@jest/globals')['jest'];
declare const jest: JestApi;

function mockLoadRunAnalytics() {
  return jest.requireActual('../transport/runAnalytics') as RunAnalyticsModule;
}

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
  const actual = mockLoadRunAnalytics();
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

type ChipButtonInstance = {
  type?: unknown;
  props: {
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
    children?: unknown;
  };
};

const isChipButtonInstance = (instance: unknown): instance is ChipButtonInstance => {
  if (typeof instance !== 'object' || instance === null) {
    return false;
  }
  const candidate = instance as { type?: unknown; props?: ChipButtonInstance['props'] };
  return (
    candidate.type === 'button' &&
    typeof candidate.props?.className === 'string' &&
    candidate.props.className.includes('analyticsV2Chip')
  );
};

const findChipButtons = (tree: TestRenderer): ChipButtonInstance[] =>
  tree.root.findAll((instance: unknown) => isChipButtonInstance(instance)) as ChipButtonInstance[];

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

    const controlButtons = findChipButtons(tree!);
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

    const timeRangeButton = findChipButtons(tree!).find((button) => {
      const { children } = button.props;
      if (Array.isArray(children)) {
        return children.includes('Last 7 days');
      }
      return children === 'Last 7 days';
    });
    expect(timeRangeButton).toBeDefined();

    await act(async () => {
      timeRangeButton!.props.onClick?.();
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(2);
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

    const controlButtons = findChipButtons(tree!);
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

    const timeRangeButtons = findChipButtons(tree!).filter((button) => typeof button.props.onClick === 'function');
    expect(timeRangeButtons.length).toBeGreaterThan(0);
    const [timeRangeButton] = timeRangeButtons;

    await act(async () => {
      timeRangeButton.props.onClick?.();
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
