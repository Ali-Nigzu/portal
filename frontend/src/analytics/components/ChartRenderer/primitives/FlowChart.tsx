import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  Area,
  Bar,
  Brush,
} from "recharts";
import type { ActiveDotProps } from "recharts/types/util/types";
import type { ChartSeries } from "../../../schemas/charting";
import type { ChartPrimitiveProps } from "./types";
import { buildCartesianDataset } from "./utils";
import { ChartTooltip } from "../ui/ChartTooltip";
import { SiteFlowTooltip } from "../ui/SiteFlowTooltip";
import { SeriesLegend } from "../ui/SeriesLegend";
import { formatBrushTimestamp } from "../utils/formatBrushTimestamp";
import { formatSiteFlowTick } from "../utils/formatSiteFlowTick";

export const FlowChart = ({
  result,
  series,
  axisConfig,
  visibility,
  onToggleSeries,
  height,
  className,
}: ChartPrimitiveProps) => {
  const summary = result.meta?.summary as { title?: string; siteFlowTimeframe?: string } | undefined;
  const isSiteFlow = summary?.title === "Site Flow";
  const siteFlowTimeframe = summary?.siteFlowTimeframe;
  const siteFlowBucket = result.xDimension?.bucket;
  const sortedSeries = useMemo(() => {
    const prioritizedGroup = "occupancy";
    return series
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const aGroup = a.item.seriesGroup;
        const bGroup = b.item.seriesGroup;
        if (aGroup !== bGroup) {
          if (aGroup === prioritizedGroup) {
            return 1;
          }
          if (bGroup === prioritizedGroup) {
            return -1;
          }
        }
        return a.index - b.index;
      })
      .map((entry) => entry.item);
  }, [series]);

  const dataset = useMemo(() => buildCartesianDataset(sortedSeries), [sortedSeries]);
  const [brushRange, setBrushRange] = useState({ startIndex: 0, endIndex: 0 });
  const seriesMap = useMemo(() => {
    return new Map<string, ChartSeries>(sortedSeries.map((item) => [item.id, item]));
  }, [sortedSeries]);

  useEffect(() => {
    if (dataset.data.length === 0) {
      setBrushRange({ startIndex: 0, endIndex: 0 });
      return;
    }
    setBrushRange({
      startIndex: 0,
      endIndex: Math.max(dataset.data.length - 1, 0),
    });
  }, [dataset.data.length]);

  const startTimestamp = dataset.data[brushRange.startIndex]?.x;
  const endTimestamp = dataset.data[brushRange.endIndex]?.x;
  const startLabel = startTimestamp ? formatBrushTimestamp(startTimestamp) : "—";
  const endLabel = endTimestamp ? formatBrushTimestamp(endTimestamp) : "—";
  const startLabelCompact = startTimestamp
    ? formatBrushTimestamp(startTimestamp, { compact: true })
    : "—";
  const endLabelCompact = endTimestamp
    ? formatBrushTimestamp(endTimestamp, { compact: true })
    : "—";

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dataset.data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-strong, #d0d5dd)" />
          <XAxis
            dataKey="x"
            tick={{ fill: "var(--text-muted, #475467)" }}
            tickFormatter={
              isSiteFlow
                ? (value) => formatSiteFlowTick(siteFlowTimeframe, siteFlowBucket, String(value))
                : undefined
            }
          />
          {axisConfig.axes.map((axis) => (
            <YAxis
              key={axis.id}
              yAxisId={axis.id}
              hide={!axis.visible}
              tick={{ fill: "var(--text-muted, #475467)" }}
              orientation={axis.id === "Y1" ? "left" : "right"}
              label={{
                value: axis.label ?? axis.unit,
                angle: -90,
                position: axis.id === "Y1" ? "insideLeft" : "insideRight",
                style: { fill: "var(--text-muted, #475467)" },
              }}
            />
          ))}
          <Tooltip
            content={
              isSiteFlow ? (
                <SiteFlowTooltip
                  seriesMap={seriesMap}
                  visibility={visibility}
                  timeframe={siteFlowTimeframe}
                  bucket={siteFlowBucket}
                />
              ) : (
                <ChartTooltip meta={dataset.meta} seriesMap={seriesMap} />
              )
            }
            cursor={isSiteFlow ? false : { stroke: "var(--border-strong, #d0d5dd)" }}
          />
          {sortedSeries.map((seriesItem) => {
            const yAxisId = axisConfig.bindings[seriesItem.id] ?? "Y1";
            const hidden = visibility[seriesItem.id] === false;
            const hasLowCoverage = seriesItem.data.some(
              (point) => (point.coverage ?? 1) < 1
            );
            const dotRenderer = (props: ActiveDotProps): ReactElement<SVGElement> => {
              const { cx = 0, cy = 0 } = props;
              const payload = props.payload as { x?: string } | undefined;
              const bucketKey = payload?.x ?? "";
              const metaForPoint = dataset.meta[bucketKey]?.[seriesItem.id] ?? {};
              const coverage = metaForPoint.coverage ?? 1;
              if (!isOccupancyAvg && coverage >= 1) {
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={0}
                    fill="transparent"
                    stroke="none"
                  />
                );
              }
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="var(--surface-card, #ffffff)"
                  stroke={seriesItem.color}
                  strokeWidth={coverage < 0.5 ? 2 : 1}
                  strokeDasharray={coverage < 0.5 ? "2 2" : ""}
                />
              );
            };
            const isOccupancySeries = seriesItem.seriesGroup === "occupancy";
            const isOccupancyAvg = seriesItem.id === "occupancy_avg";
            const shouldDisableDots = seriesItem.noDots || isOccupancySeries;
            const dotProp = shouldDisableDots ? false : dotRenderer;
            const activeDotProp = isOccupancyAvg
              ? dotRenderer
              : shouldDisableDots
              ? false
              : dotRenderer;
            if (seriesItem.geometry === "bar" || seriesItem.geometry === "column") {
              return (
                <Bar
                  key={seriesItem.id}
                  dataKey={seriesItem.id}
                  yAxisId={yAxisId}
                  fill={seriesItem.color}
                  hide={hidden}
                  isAnimationActive={false}
                  barSize={20}
                  stackId={seriesItem.stack}
                />
              );
            }
            if (seriesItem.geometry === "area") {
              const areaDotProps = shouldDisableDots ? { dot: false, activeDot: false } : {};
              return (
                <Area
                  key={seriesItem.id}
                  type="monotone"
                  dataKey={seriesItem.id}
                  stroke={seriesItem.color}
                  fill={seriesItem.color}
                  fillOpacity={seriesItem.fillOpacity ?? 0.25}
                  strokeOpacity={seriesItem.strokeOpacity}
                  yAxisId={yAxisId}
                  hide={hidden}
                  strokeDasharray={hasLowCoverage ? "6 4" : undefined}
                  stackId={seriesItem.stack}
                  isAnimationActive={false}
                  {...areaDotProps}
                />
              );
            }
            if (seriesItem.geometry === "line") {
              return (
                <Line
                  key={seriesItem.id}
                  type="monotone"
                  dataKey={seriesItem.id}
                  stroke={seriesItem.color}
                  strokeOpacity={seriesItem.strokeOpacity}
                  strokeWidth={2}
                  dot={dotProp}
                  activeDot={activeDotProp}
                  yAxisId={yAxisId}
                  hide={hidden}
                  isAnimationActive={false}
                  strokeDasharray={hasLowCoverage ? "6 4" : undefined}
                />
              );
            }
            return null;
          })}
          <Brush
            dataKey="x"
            height={24}
            travellerWidth={12}
            stroke="var(--border-strong, rgba(130, 144, 166, 0.35))"
            fill="var(--surface-muted, rgba(15, 19, 26, 0.35))"
            tickFormatter={() => ""}
            onChange={(nextRange) => setBrushRange(nextRange)}
            startIndex={brushRange.startIndex}
            endIndex={brushRange.endIndex}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {dataset.data.length > 0 ? (
        <div className="analytics-brush-labels">
          <div className="analytics-brush-label">
            <span className="analytics-brush-caption">Start</span>
            <span className="analytics-brush-value analytics-brush-value--full">
              {startLabel}
            </span>
            <span className="analytics-brush-value analytics-brush-value--compact">
              {startLabelCompact}
            </span>
          </div>
          <div className="analytics-brush-label analytics-brush-label--end">
            <span className="analytics-brush-caption">End</span>
            <span className="analytics-brush-value analytics-brush-value--full">
              {endLabel}
            </span>
            <span className="analytics-brush-value analytics-brush-value--compact">
              {endLabelCompact}
            </span>
          </div>
        </div>
      ) : null}
      <SeriesLegend
        series={series}
        visibility={visibility}
        onToggleSeries={onToggleSeries}
      />
    </div>
  );
};
