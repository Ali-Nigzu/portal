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
}
