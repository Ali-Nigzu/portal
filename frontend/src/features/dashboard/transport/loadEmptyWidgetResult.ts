import type { ChartResult, DataPoint, SeriesSummary } from '../../../analytics/schemas/charting';
import type { DashboardWidget } from '../types';
import type { LoadWidgetOptions } from './loadWidgetResult';
import { loadWidgetResult } from './loadWidgetResult';

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

const toEmptyResult = (result: ChartResult): ChartResult => {
  const nextSeries = result.series.map((series) => {
    const nextData = series.data.length > 0
      ? series.data.map((point) => zeroPoint(point))
      : [{ x: '0', y: 0, value: 0 }];

    const expandedData = result.chartType === 'single_value' && nextData.length < 24
      ? Array.from({ length: 24 }, (_, idx) => ({
          ...nextData[0],
          x: String(idx),
          y: 0,
          value: 0,
        }))
      : nextData;

    return {
      ...series,
      data: expandedData,
      summary: zeroSummary(series.summary),
    };
  });

  const summary = result.meta.summary ?? {};
  const nextSummary: Record<string, number | string | null> = {};
  Object.entries(summary).forEach(([key, value]) => {
    nextSummary[key] = typeof value === 'number' ? 0 : value;
  });

  return {
    ...result,
    series: nextSeries,
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
  const result = await loadWidgetResult(widget, options);
  return toEmptyResult(result);
}
