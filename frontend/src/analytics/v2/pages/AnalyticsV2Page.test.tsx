import renderer, { act } from 'react-test-renderer';
import type { TestRenderer } from 'react-test-renderer';
import type { ChartResult, ChartSeries, ChartSpec } from '../../schemas/charting';
import type { AnalyticsRunResponse } from '../transport/runAnalytics';
import type { AnalyticsTransportMode } from '../../../config';
import { hashChartSpec } from '../transport/hashChartSpec';
import AnalyticsV2Page, { AnalyticsV2Page as AnalyticsV2PageBase } from './AnalyticsV2Page';

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

type PresetButtonInstance = {
  type?: unknown;
  props: {
    ['aria-label']?: string;
    onClick?: () => void;
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

const isPresetButtonInstance = (instance: unknown): instance is PresetButtonInstance => {
  if (typeof instance !== 'object' || instance === null) {
    return false;
  }
  const candidate = instance as { type?: unknown; props?: PresetButtonInstance['props'] };
  return candidate.type === 'button' && typeof candidate.props?.['aria-label'] === 'string';
};

const findChipButtons = (tree: TestRenderer): ChipButtonInstance[] =>
  tree.root.findAll((instance: unknown) => isChipButtonInstance(instance)) as ChipButtonInstance[];

const findChipButtonByLabel = (tree: TestRenderer, label: string): ChipButtonInstance | undefined =>
  findChipButtons(tree).find((button) => {
    const { children } = button.props;
    if (Array.isArray(children)) {
      return children.includes(label);
    }
    return children === label;
  });

const findPresetButtonByLabel = (tree: TestRenderer, label: string): PresetButtonInstance | undefined =>
  (tree.root
    .findAll((instance: unknown) => isPresetButtonInstance(instance)) as PresetButtonInstance[])
    .find((button: PresetButtonInstance) => button.props?.['aria-label'] === `${label} preset`);

const buildSeriesForSpec = (spec: ChartSpec): ChartSeries[] =>
  spec.measures.map((measure) => ({
    id: measure.id ?? measure.label ?? 'measure',
    label: measure.label ?? measure.id ?? 'Measure',
    geometry: 'line',
    axis: 'Y1',
    unit: 'events',
    data: [],
  }));

const buildResultForSpec = (spec: ChartSpec): ChartResult => {
  if (spec.chartType === 'retention') {
    return {
      chartType: 'retention',
      xDimension: { id: spec.dimensions[0]?.id ?? 'cohort_week', type: 'category' },
      series: [],
      meta: { timezone: spec.timeWindow.timezone ?? 'UTC', coverage: [] },
    };
  }
  const dimension = spec.dimensions[0];
  return {
    chartType: 'composed_time',
    xDimension: {
      id: dimension?.id ?? 'timestamp',
      type: dimension?.bucket ? 'time' : 'category',
      bucket: spec.timeWindow.bucket,
      timezone: spec.timeWindow.timezone ?? 'UTC',
    },
    series: buildSeriesForSpec(spec),
    meta: { timezone: spec.timeWindow.timezone ?? 'UTC', coverage: [] },
  };
};

describe('AnalyticsV2Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunAnalytics.mockImplementation(
      async (_preset, spec, modeArg?: AnalyticsTransportMode) => {
        const mode: AnalyticsTransportMode = modeArg ?? 'live';
        const result = buildResultForSpec(spec);
        return {
          result,
          spec,
          specHash: hashChartSpec(spec),
          mode,
          diagnostics: { partialData: false },
        };
      },
    );
    mockPinDashboardWidget.mockResolvedValue({
      id: 'dashboard-default',
      orgId: 'client0',
      widgets: [],
      layout: { kpiBand: [], grid: { columns: 12, placements: {} } },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads the default preset with live transport so inspector controls remain enabled', async () => {
    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AnalyticsV2Page credentials={{ username: 'client0', password: 'secret' }} />,
      );
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(1);
    const controlButtons = findChipButtons(tree!);
    expect(controlButtons.length).toBeGreaterThan(0);
    controlButtons.forEach((button) => {
      expect(button.props.disabled).toBe(false);
    });
  });

  it('disables preset controls when fixture transport is forced', async () => {
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

  it('re-runs Live Flow with a mutated spec when the time override changes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-02-01T12:00:00Z'));

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
    const initialSpec = mockRunAnalytics.mock.calls[0][1] as ChartSpec;
    const initialHash = hashChartSpec(initialSpec);
    expect(initialSpec.timeWindow.bucket).toBe('HOUR');

    const nextButton = findChipButtonByLabel(tree!, 'Last 7 days');
    expect(nextButton).toBeDefined();

    await act(async () => {
      nextButton!.props.onClick?.();
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(2);
    const nextSpec = mockRunAnalytics.mock.calls[1][1] as ChartSpec;
    const nextHash = hashChartSpec(nextSpec);
    expect(nextSpec.timeWindow.bucket).toBe('DAY');
    expect(nextSpec.timeWindow.from).not.toEqual(initialSpec.timeWindow.from);
    expect(nextHash).not.toEqual(initialHash);
  });

  it('re-runs Average Dwell by Camera when a longer time range is selected', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-02-01T12:00:00Z'));

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AnalyticsV2Page credentials={{ username: 'client0', password: 'secret' }} />,
      );
    });
    await flushEffects();

    mockRunAnalytics.mockClear();

    const dwellButton = findPresetButtonByLabel(tree!, 'Average Dwell by Camera');
    expect(dwellButton).toBeDefined();

    await act(async () => {
      dwellButton!.props.onClick?.();
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(1);
    const initialSpec = mockRunAnalytics.mock.calls[0][1] as ChartSpec;
    const initialHash = hashChartSpec(initialSpec);

    const extendButton = findChipButtonByLabel(tree!, 'Last 30 days');
    expect(extendButton).toBeDefined();

    await act(async () => {
      extendButton!.props.onClick?.();
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(2);
    const nextSpec = mockRunAnalytics.mock.calls[1][1] as ChartSpec;
    const nextHash = hashChartSpec(nextSpec);
    expect(nextSpec.timeWindow.from).not.toEqual(initialSpec.timeWindow.from);
    expect(nextHash).not.toEqual(initialHash);
  });

  it('re-runs Retention Heatmap and expands the cohort window when the inspector time range changes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-02-01T12:00:00Z'));

    let tree: TestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AnalyticsV2Page credentials={{ username: 'client0', password: 'secret' }} />,
      );
    });
    await flushEffects();

    mockRunAnalytics.mockClear();

    const retentionButton = findPresetButtonByLabel(tree!, 'Retention Heatmap');
    expect(retentionButton).toBeDefined();

    await act(async () => {
      retentionButton!.props.onClick?.();
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(1);
    const initialSpec = mockRunAnalytics.mock.calls[0][1] as ChartSpec;
    const initialHash = hashChartSpec(initialSpec);
    expect(initialSpec.timeWindow.bucket).toBe('WEEK');

    const shorterButton = findChipButtonByLabel(tree!, 'Last 12 weeks');
    expect(shorterButton).toBeDefined();

    await act(async () => {
      shorterButton!.props.onClick?.();
    });
    await flushEffects();

    expect(mockRunAnalytics).toHaveBeenCalledTimes(2);
    const nextSpec = mockRunAnalytics.mock.calls[1][1] as ChartSpec;
    const nextHash = hashChartSpec(nextSpec);
    expect(nextSpec.timeWindow.bucket).toBe('WEEK');
    expect(nextSpec.timeWindow.from).not.toEqual(initialSpec.timeWindow.from);
    expect(nextHash).not.toEqual(initialHash);
  });

  it('renders an error state when analytics transport fails', async () => {
    mockRunAnalytics.mockReset();
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
