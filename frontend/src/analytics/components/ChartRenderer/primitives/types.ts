import type { ChartResult, ChartSeries } from "../../../schemas/charting";
import type { AxisConfig, SeriesVisibilityMap } from "../managers";
export interface ChartPrimitiveProps {
  result: ChartResult;
  series: ChartSeries[];
  axisConfig: AxisConfig;
  visibility: SeriesVisibilityMap;
  onToggleSeries?: (seriesId: string) => void;
  height: number;
  className?: string;
  widgetId?: string;
  useRawLabels?: boolean;
  labelKey?: string;
  showBrush?: boolean;
  tooltipVariant?: "site_flow_activity";
  siteFlowTimeframe?: string;
  hideInactiveLegend?: boolean;
}
