import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartResult, ChartSeries } from "../../schemas/charting";
import { AxisManager, PaletteManager, SeriesManager } from "./managers";
import type { SeriesVisibilityMap } from "./managers";
import {
  TimeSeriesChart,
  BarChart,
  KpiTile,
  TrafficDistribution,
  CapacityDonut,
} from "./primitives";
import { ChartErrorState } from "./ui/ChartErrorState";
import { ChartEmptyState } from "./ui/ChartEmptyState";
import { validateChartResult } from "./validation";
import { SITE_FLOW_ACTIVITY_COLORS } from "../../../lib/siteFlowActivityColors";
import "./styles.css";
export interface ChartRendererProps {
  result: ChartResult;
  height?: number;
  className?: string;
  onVisibilityChange?: (visibility: SeriesVisibilityMap) => void;
  widgetId?: string;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
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
  widgetId,
  donutTooltipMode = "legacy",
}: ChartRendererProps) => {
  const [visibility, setVisibility] = useState<SeriesVisibilityMap>(() =>
    buildInitialVisibility(result.series),
  );
  const validationIssues = useMemo(() => validateChartResult(result), [result]);
  const resolvedClassName = useMemo(
    () =>
      ["analytics-chart-surface", className]
        .filter((token) => token && token.trim().length > 0)
        .join(" "),
    [className],
  );
  const isEmpty = useMemo(() => {
    if (!result.series.length) {
      return true;
    }
    const empties = result.series.map((seriesItem) => {
      if (!seriesItem.data || seriesItem.data.length === 0) {
        return { id: seriesItem.id, empty: true, reason: "no-data" } as const;
      }
      const allNull = seriesItem.data.every((point) => {
        const value = point.y ?? point.value ?? null;
        return value === null || value === undefined;
      });
      return {
        id: seriesItem.id,
        empty: allNull,
        reason: allNull ? "all-null" : "has-value",
      } as const;
    });
    return empties.every((entry) => entry.empty);
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
    [result.series],
  );
  const paletteRef = useRef(new PaletteManager());
  useEffect(() => {
    paletteRef.current = new PaletteManager();
  }, [paletteKey]);
  const summary = result.meta?.summary as
    | { presentation?: string; chartStyle?: string; chartSubType?: string }
    | undefined;
  const summaryRecord = summary as Record<string, unknown> | undefined;
  const summaryTitle =
    typeof summaryRecord?.title === "string"
      ? (summaryRecord.title as string)
      : undefined;
  const siteFlowTimeframe =
    typeof summaryRecord?.siteFlowTimeframe === "string"
      ? (summaryRecord.siteFlowTimeframe as string)
      : undefined;
  const summaryTitleNormalized = summaryTitle?.toLowerCase().trim();
  const isSiteFlowActivity =
    widgetId === "live-flow" ||
    widgetId === "site-flow" ||
    widgetId === "dashboard.site_flow.activity" ||
    summaryTitleNormalized === "site flow";
  const palette = paletteRef.current;
  const decoratedSeries = useMemo(() => {
    return result.series.map((series) => {
      const siteFlowColor = SITE_FLOW_ACTIVITY_COLORS[series.id];
      if (isSiteFlowActivity && siteFlowColor) {
        return { ...series, color: siteFlowColor };
      }
      return {
        ...series,
        color: series.color ?? palette.getColor(series.id),
      };
    });
  }, [isSiteFlowActivity, palette, result.series]);
  const seriesManager = useMemo(
    () => new SeriesManager(decoratedSeries, visibility),
    [decoratedSeries, visibility],
  );
  const visibleSeries = useMemo(
    () => seriesManager.getVisibleSeries(),
    [seriesManager],
  );
  const axisManager = useMemo(
    () => new AxisManager(decoratedSeries),
    [decoratedSeries],
  );
  const axisConfig = useMemo(
    () => axisManager.build(visibleSeries),
    [axisManager, visibleSeries],
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
    widgetId,
    showBrush: !isSiteFlowActivity,
    tooltipVariant: isSiteFlowActivity ? "site_flow_activity" : undefined,
    siteFlowTimeframe,
    hideInactiveLegend: false,
    siteFlowActivity: isSiteFlowActivity,
    donutTooltipMode,
  };
  const chartStyle =
    summary?.chartStyle ||
    (result as unknown as { chartStyle?: string }).chartStyle;
  const chartSubType =
    summary?.chartSubType ||
    (result as unknown as { chartSubType?: string }).chartSubType;
  const isVrmTrafficByTitle =
    summary?.presentation === "vrm" &&
    summaryTitleNormalized === "traffic by camera";
  const isVrmPresentation = summary?.presentation === "vrm";
  const isTrafficWidgetId = isVrmPresentation && widgetId === "kpi-vrm-traffic";
  const hasTrafficStyle =
    chartStyle === "traffic_distribution" ||
    chartSubType === "traffic_distribution";
  const isTrafficDistribution =
    hasTrafficStyle || isVrmTrafficByTitle || isTrafficWidgetId;
  const isCapacityUsage =
    chartStyle === "capacity_usage" || chartSubType === "capacity_usage";
  if (validationIssues.length > 0) {
    return (
      <ChartErrorState
        issues={validationIssues}
        height={height}
        className={resolvedClassName}
      />
    );
  }
  if (isTrafficDistribution) {
    return <TrafficDistribution {...chartProps} height={height} />;
  }
  if (isCapacityUsage && isVrmPresentation) {
    return <CapacityDonut {...chartProps} height={height} />;
  }
  if (isEmpty) {
    return <ChartEmptyState height={height} className={resolvedClassName} />;
  }
  if (result.chartType === "single_value") {
    return <KpiTile {...chartProps} />;
  }
  if (result.chartType === "categorical") {
    return <BarChart {...chartProps} />;
  }
  if (result.chartType === "composed_time") {
    return <TimeSeriesChart {...chartProps} />;
  }
  return <TimeSeriesChart {...chartProps} />;
};
