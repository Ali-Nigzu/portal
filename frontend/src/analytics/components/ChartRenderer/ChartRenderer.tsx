import { type SeriesVisibilityMap, type ChartPrimitiveProps, type ChartResult, type ChartSeries, SITE_FLOW_ACTIVITY_COLORS } from "../../schemas/charting";

import { type ValidationIssue, validateChartResult } from "./validation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AxisManager } from "./managers/AxisManager";
import { TimeSeriesChart } from "./primitives/TimeSeriesChart";
import { KpiTile } from "./primitives/KpiTile";
import { TrafficDistribution } from "./primitives/TrafficDistribution";
import { CapacityDonut } from "./primitives/CapacityDonut";

import "./styles.css";

interface ChartRendererProps {
  result: ChartResult;
  height?: number;
  className?: string;
  onVisibilityChange?: (visibility: SeriesVisibilityMap) => void;
  widgetId?: string;
  donutTooltipMode?: "standard" | "demo_cursor_hover";
  donutTooltipOwnerId?: string;
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
  donutTooltipMode = "standard",
  donutTooltipOwnerId,
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
    { presentation?: string; chartStyle?: string } | undefined;
  const summaryRecord = summary as Record<string, unknown> | undefined;
  const siteFlowTimeframe =
    typeof summaryRecord?.siteFlowTimeframe === "string"
      ? summaryRecord.siteFlowTimeframe
      : undefined;
  const isSiteFlowActivity = summary?.chartStyle === "site_flow_activity";
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
  const chartProps: ChartPrimitiveProps = {
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
    donutTooltipOwnerId,
  };
  const isTrafficDistribution = summary?.chartStyle === "traffic_distribution";
  const isCapacityUsage = summary?.chartStyle === "capacity_usage";
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
  if (isCapacityUsage) {
    return <CapacityDonut {...chartProps} height={height} />;
  }
  if (isEmpty) {
    return null;
  }
  if (result.chartType === "single_value") {
    return <KpiTile {...chartProps} />;
  }
  return <TimeSeriesChart {...chartProps} />;
};

const RESERVED_SERIES_COLORS: Record<string, string> = {
  occupancy: "var(--chart-signal, #a77a21)",
  entrances: "var(--chart-series-2, #647080)",
  exits: "var(--chart-series-3, #7b8796)",
  throughput: "var(--chart-series-4, #8b887d)",
  dwell_mean: "var(--chart-series-5, #9f8a61)",
  dwell_p90: "var(--chart-series-6, #b49d74)",
};

const DEFAULT_PALETTE = [
  "var(--chart-series-2, #647080)",
  "var(--chart-series-3, #7b8796)",
  "var(--chart-series-4, #8f9aaa)",
  "var(--chart-series-5, #6f7c8d)",
  "var(--chart-series-6, #9ba5b2)",
  "var(--chart-series-7, #7a8798)",
  "var(--chart-series-8, #a9b3bf)",
  "var(--chart-series-9, #8793a3)",
  "var(--chart-series-10, #b5bdc7)",
  "var(--chart-signal, #a77a21)",
];

class PaletteManager {
  private palette: string[];
  private reserved: Record<string, string>;
  private assignments = new Map<string, string>();
  private paletteIndex = 0;

  constructor(
    palette: string[] = DEFAULT_PALETTE,
    reserved: Record<string, string> = RESERVED_SERIES_COLORS,
  ) {
    this.palette = palette;
    this.reserved = reserved;
  }

  getColor(seriesId: string): string {
    if (this.assignments.has(seriesId)) {
      return this.assignments.get(seriesId)!;
    }

    const reservedMatch = this.getReservedColor(seriesId);
    if (reservedMatch) {
      this.assignments.set(seriesId, reservedMatch);
      return reservedMatch;
    }

    const color = this.palette[this.paletteIndex % this.palette.length];
    this.assignments.set(seriesId, color);
    this.paletteIndex += 1;
    return color;
  }

  private getReservedColor(seriesId: string): string | undefined {
    const normalized = seriesId.toLowerCase();
    const direct = this.reserved[normalized];
    if (direct) {
      return direct;
    }
    const key = Object.keys(this.reserved).find((reservedKey) =>
      normalized.includes(reservedKey),
    );
    return key ? this.reserved[key] : undefined;
  }
}

class SeriesManager {
  private visibility: Map<string, boolean>;
  private seriesById: Map<string, ChartSeries>;
  private seriesByGroup: Map<string, string[]>;
  constructor(series: ChartSeries[], initial?: SeriesVisibilityMap) {
    this.seriesById = new Map(series.map((item) => [item.id, item]));
    this.seriesByGroup = new Map();
    series.forEach((item) => {
      if (!item.seriesGroup) {
        return;
      }
      const ids = this.seriesByGroup.get(item.seriesGroup) ?? [];
      ids.push(item.id);
      this.seriesByGroup.set(item.seriesGroup, ids);
    });
    this.visibility = new Map(
      series.map((s) => [s.id, initial?.[s.id] ?? true] as const),
    );
  }
  toggle(seriesId: string): void {
    const series = this.seriesById.get(seriesId);
    if (!series || !this.visibility.has(seriesId)) {
      return;
    }
    const group = series.seriesGroup;
    if (group && this.seriesByGroup.has(group)) {
      const nextVisibility = !this.visibility.get(seriesId);
      (this.seriesByGroup.get(group) ?? []).forEach((id) => {
        if (this.visibility.has(id)) {
          this.visibility.set(id, nextVisibility);
        }
      });
      return;
    }
    this.visibility.set(seriesId, !this.visibility.get(seriesId));
  }
  getVisibleSeries(): Set<string> {
    return new Set(
      Array.from(this.visibility.entries())
        .filter(([, visible]) => visible)
        .map(([id]) => id),
    );
  }
  toObject(): SeriesVisibilityMap {
    const result: SeriesVisibilityMap = {};
    this.visibility.forEach((visible, id) => {
      result[id] = visible;
    });
    return result;
  }
}

interface ChartErrorStateProps {
  issues: ValidationIssue[];
  height: number;
  className?: string;
}
const ChartErrorState = ({
  issues,
  height,
  className,
}: ChartErrorStateProps) => {
  return (
    <div
      className={`analytics-chart-error ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      <div className="analytics-chart-error__icon" aria-hidden="true">
        {" "}
        ⚠️{" "}
      </div>
      <div className="analytics-chart-error__content">
        <h4>Unable to render chart</h4>
        <p>Backend chart payload violated the Phase 2 contract:</p>
        <ul>
          {" "}
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}{" "}
        </ul>
      </div>
    </div>
  );
};
