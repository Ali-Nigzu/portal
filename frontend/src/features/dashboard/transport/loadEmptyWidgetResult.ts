import type {
  ChartResult,
  ChartSeries,
  DataPoint,
  SeriesSummary,
} from '../../../analytics/schemas/charting';
import type { DashboardWidget } from '../types';
import type { LoadWidgetOptions } from './loadWidgetResult';
import { loadWidgetResult } from './loadWidgetResult';

const KPI_POINT_COUNT = 24;

const zeroSummary = (summary?: SeriesSummary): SeriesSummary | undefined => {
  if (!summary) return undefined;
  const next: SeriesSummary = {};
  Object.entries(summary).forEach(([key, value]) => {
    next[key] = typeof value === 'number' ? 0 : value;
  });
  return next;
};

const zeroPoint = (point: DataPoint): DataPoint => ({
  ...point,
  y: 0,
  value: 0,
  comparison: point.comparison == null ? point.comparison : 0,
  target: point.target == null ? point.target : 0,
  rawCount: point.rawCount == null ? point.rawCount : 0,
});

const buildKpiSeries = (): ChartSeries[] => [
  {
    id: 'value',
    geometry: 'line',
    data: Array.from({ length: KPI_POINT_COUNT }, (_, idx) => ({
      x: String(idx),
      y: 0,
      value: 0,
    })),
  },
];

const normalizeSeries = (result: ChartResult): ChartSeries[] => {
  if (result.series.length === 0 && result.chartType === 'single_value') {
    return buildKpiSeries();
  }

  return result.series.map((series) => {
    const fallbackPoint: DataPoint = { x: '0', y: 0, value: 0 };
    const zeroedData = series.data.length > 0
      ? series.data.map((point) => zeroPoint(point))
      : [fallbackPoint];

    const expandedData = result.chartType === 'single_value' && zeroedData.length < KPI_POINT_COUNT
      ? Array.from({ length: KPI_POINT_COUNT }, (_, idx) => ({
          ...zeroedData[0],
          x: String(idx),
          y: 0,
          value: 0,
        }))
      : zeroedData;

    return {
      ...series,
      data: expandedData,
      summary: zeroSummary(series.summary),
    };
  });
};

export const sanitizeChartResultForAuthenticated = (
  result: ChartResult,
): ChartResult => {
  const summary = result.meta.summary ?? {};
  const nextSummary: Record<string, number | string | null> = {};
  Object.entries(summary).forEach(([key, value]) => {
    nextSummary[key] = typeof value === 'number' ? 0 : value;
  });

  return {
    ...result,
    series: normalizeSeries(result),
    meta: {
      ...result.meta,
      summary: nextSummary,
      coverage: [],
      surges: [],
    },
  };
};

export async function loadEmptyWidgetResult(
  widget: DashboardWidget,
  options: LoadWidgetOptions = {},
): Promise<ChartResult> {
  const result = await loadWidgetResult(widget, {
    ...options,
    dataMode: 'authenticated',
  });
  return sanitizeChartResultForAuthenticated(result);
}
