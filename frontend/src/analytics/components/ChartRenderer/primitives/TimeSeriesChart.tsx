import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
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
import { SeriesLegend } from "../ui/SeriesLegend";
import { formatBrushTimestamp } from "../utils/formatBrushTimestamp";
import { formatSiteFlowTick } from "../utils/formatSiteFlowTick";
export const TimeSeriesChart = ({
  series,
  axisConfig,
  visibility,
  onToggleSeries,
  height,
  className,
  showBrush = true,
  tooltipVariant,
  siteFlowTimeframe,
  result,
  hideInactiveLegend,
  siteFlowActivity = false,
}: ChartPrimitiveProps) => {
  const dataset = useMemo(() => buildCartesianDataset(series), [series]);
  const [brushRange, setBrushRange] = useState({ startIndex: 0, endIndex: 0 });
  const seriesMap = useMemo(() => {
    return new Map<string, ChartSeries>(series.map((item) => [item.id, item]));
  }, [series]);
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
  const startLabel = startTimestamp
    ? formatBrushTimestamp(startTimestamp)
    : "—";
  const endLabel = endTimestamp ? formatBrushTimestamp(endTimestamp) : "—";
  const startLabelCompact = startTimestamp
    ? formatBrushTimestamp(startTimestamp, { compact: true })
    : "—";
  const endLabelCompact = endTimestamp
    ? formatBrushTimestamp(endTimestamp, { compact: true })
    : "—";
  const isSiteFlowActivity = tooltipVariant === "site_flow_activity";
  const bucket = result.xDimension?.bucket;
  const tickFormatter = siteFlowTimeframe
    ? (value: string) => formatSiteFlowTick(siteFlowTimeframe, bucket, value)
    : undefined;
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={dataset.data}
          margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
          accessibilityLayer={!isSiteFlowActivity}
        >
          <XAxis
            dataKey="x"
            tick={{ fill: "var(--text-muted, #475467)" }}
            tickFormatter={tickFormatter}
          />{" "}
          {axisConfig.axes.map((axis) => (
            <YAxis
              key={axis.id}
              yAxisId={axis.id}
              hide={!axis.visible}
              tick={{ fill: "var(--text-muted, #475467)" }}
              orientation={
                isSiteFlowActivity && axis.id !== "Y1" ? "right" : "left"
              }
              label={{
                value: axis.label ?? axis.unit,
                angle: isSiteFlowActivity && axis.id !== "Y1" ? 90 : -90,
                position:
                  isSiteFlowActivity && axis.id !== "Y1"
                    ? "insideRight"
                    : "insideLeft",
                style: { fill: "var(--text-muted, #475467)" },
              }}
            />
          ))}{" "}
          <Tooltip
            content={
              <ChartTooltip
                meta={dataset.meta}
                seriesMap={seriesMap}
                variant={tooltipVariant}
                siteFlowTimeframe={siteFlowTimeframe}
                bucket={bucket}
              />
            }
            cursor={isSiteFlowActivity ? false : { stroke: "var(--border-strong, #d0d5dd)" }}
          />{" "}
          {series.map((seriesItem) => {
            const yAxisId = axisConfig.bindings[seriesItem.id] ?? "Y1";
            const hidden = visibility[seriesItem.id] === false;
            const hasLowCoverage = seriesItem.data.some(
              (point) => (point.coverage ?? 1) < 1,
            );
            const dotRenderer = (
              props: ActiveDotProps,
            ): ReactElement<SVGElement> => {
              const { cx = 0, cy = 0 } = props;
              const payload = props.payload as { x?: string } | undefined;
              const bucketKey = payload?.x ?? "";
              const metaForPoint =
                dataset.meta[bucketKey]?.[seriesItem.id] ?? {};
              const coverage = metaForPoint.coverage ?? 1;
              if (coverage >= 1) {
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill={seriesItem.color}
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
            if (seriesItem.geometry === "area") {
              return (
                <Area
                  key={seriesItem.id}
                  type="monotone"
                  dataKey={seriesItem.id}
                  stroke={seriesItem.color}
                  fill={seriesItem.color}
                  fillOpacity={0.25}
                  yAxisId={yAxisId}
                  hide={hidden}
                  strokeDasharray={hasLowCoverage ? "6 4" : undefined}
                  isAnimationActive={false}
                />
              );
            }
            if (seriesItem.geometry === "line") {
              const showDots = seriesItem.id !== "occupancy";
              return (
                <Line
                  key={seriesItem.id}
                  type="monotone"
                  dataKey={seriesItem.id}
                  stroke={seriesItem.color}
                  strokeWidth={2}
                  dot={showDots ? dotRenderer : false}
                  yAxisId={yAxisId}
                  hide={hidden}
                  isAnimationActive={false}
                  strokeDasharray={hasLowCoverage ? "6 4" : undefined}
                  activeDot={showDots ? undefined : false}
                />
              );
            }
            if (
              seriesItem.geometry === "bar" ||
              seriesItem.geometry === "column"
            ) {
              return (
                <Bar
                  key={seriesItem.id}
                  dataKey={seriesItem.id}
                  yAxisId={yAxisId}
                  fill={seriesItem.color}
                  hide={hidden}
                  isAnimationActive={false}
                  barSize={18}
                />
              );
            }
            return null;
          })}{" "}
          {showBrush ? (
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
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>{" "}
      {showBrush && dataset.data.length > 0 ? (
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
        hideInactive={hideInactiveLegend}
        siteFlowActivity={siteFlowActivity}
      />
    </div>
  );
};
