import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartResult, ChartSeries } from "../../schemas/charting";
import { AxisManager, PaletteManager, SeriesManager } from "./managers";
import type { SeriesVisibilityMap } from "./managers";
import {
  TimeSeriesChart,
  FlowChart,
  BarChart,
  HeatmapChart,
  KpiTile,
} from "./primitives";
import { ChartErrorState } from "./ui/ChartErrorState";
import { ChartEmptyState } from "./ui/ChartEmptyState";
import { validateChartResult } from "./validation";
import "./styles.css";

export interface ChartRendererProps {
  result: ChartResult;
  height?: number;
  className?: string;
  onVisibilityChange?: (visibility: SeriesVisibilityMap) => void;
}

function buildInitialVisibility(series: ChartSeries[]): SeriesVisibilityMap {
  return series.reduce<SeriesVisibilityMap>((acc, series) => {
    acc[series.id] = true;
    return acc;
  }, {});
}

export const ChartRenderer = ({
  result,
  height = 320,
  className,
  onVisibilityChange,
}: ChartRendererProps) => {
  const [visibility, setVisibility] = useState<SeriesVisibilityMap>(() =>
    buildInitialVisibility(result.series)
  );

  const validationIssues = useMemo(
    () => validateChartResult(result),
    [result]
  );

  const resolvedClassName = useMemo(
    () =>
      ["analytics-chart-surface", className]
        .filter((token) => token && token.trim().length > 0)
        .join(" "),
    [className]
  );

  const isEmpty = useMemo(() => {
    if (!result.series.length) {
      return true;
    }
    return result.series.every((seriesItem) => {
      if (!seriesItem.data || seriesItem.data.length === 0) {
        return true;
      }
      return seriesItem.data.every((point) => {
        const value = point.y ?? point.value ?? null;
        return value === null || value === undefined;
      });
    });
  }, [result]);

  useEffect(() => {
    const nextVisibility = buildInitialVisibility(result.series);
    setVisibility(nextVisibility);
    if (onVisibilityChange) {
      onVisibilityChange(nextVisibility);
    }
  }, [result, onVisibilityChange]);

  const paletteKey = useMemo(
    () => result.series.map((series) => series.id).join("|"),
    [result.series]
  );
  const paletteRef = useRef(new PaletteManager());

  useEffect(() => {
    paletteRef.current = new PaletteManager();
  }, [paletteKey]);

  const palette = paletteRef.current;

  const decoratedSeries = useMemo(() => {
    return result.series.map((series) => ({
      ...series,
      color: series.color ?? palette.getColor(series.id),
    }));
  }, [palette, result.series]);

  const seriesManager = useMemo(
    () => new SeriesManager(decoratedSeries, visibility),
    [decoratedSeries, visibility]
  );

  const visibleSeries = useMemo(() => seriesManager.getVisibleSeries(), [seriesManager]);

  const axisManager = useMemo(
    () => new AxisManager(decoratedSeries),
    [decoratedSeries]
  );

  const axisConfig = useMemo(
    () => axisManager.build(visibleSeries),
    [axisManager, visibleSeries]
  );

  const handleToggleSeries = (seriesId: string) => {
    setVisibility((prev) => {
      const manager = new SeriesManager(decoratedSeries, prev);
      manager.toggle(seriesId);
      const next = manager.toObject();
      if (onVisibilityChange) {
        onVisibilityChange(next);
      }
      return next;
    });
  };

  const chartProps = {
    result,
    series: decoratedSeries,
    axisConfig,
    visibility,
    onToggleSeries: handleToggleSeries,
    height,
    className: resolvedClassName,
  };

  if (validationIssues.length > 0) {
    return (
      <ChartErrorState
        issues={validationIssues}
        height={height}
        className={resolvedClassName}
      />
    );
  }

  if (isEmpty) {
    return (
      <ChartEmptyState
        height={height}
        className={resolvedClassName}
      />
    );
  }

  if (result.chartType === "single_value") {
    return <KpiTile {...chartProps} />;
  }

  if (result.chartType === "heatmap" || result.chartType === "retention") {
    return <HeatmapChart {...chartProps} />;
  }

  if (result.chartType === "categorical") {
    return <BarChart {...chartProps} />;
  }

  if (result.chartType === "composed_time") {
    const geometries = new Set(result.series.map((series) => series.geometry));
    const hasBar = geometries.has("bar") || geometries.has("column");
    const hasArea = geometries.has("area");
    const hasLine = geometries.has("line");
    if ((hasArea && hasBar) || (hasBar && hasLine)) {
      return <FlowChart {...chartProps} />;
    }
    return <TimeSeriesChart {...chartProps} />;
  }

  return <TimeSeriesChart {...chartProps} />;
};
