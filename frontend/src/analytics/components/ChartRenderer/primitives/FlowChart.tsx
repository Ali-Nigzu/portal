import { useMemo } from "react";
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
import { SeriesLegend } from "../ui/SeriesLegend";

export const FlowChart = ({
  series,
  axisConfig,
  visibility,
  onToggleSeries,
  height,
  className,
}: ChartPrimitiveProps) => {
  const dataset = useMemo(() => buildCartesianDataset(series), [series]);
  const seriesMap = useMemo(() => {
    return new Map<string, ChartSeries>(series.map((item) => [item.id, item]));
  }, [series]);

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dataset.data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-strong, #d0d5dd)" />
          <XAxis dataKey="x" tick={{ fill: "var(--text-muted, #475467)" }} />
          {axisConfig.axes.map((axis) => (
            <YAxis
              key={axis.id}
              yAxisId={axis.id}
              hide={!axis.visible}
              tick={{ fill: "var(--text-muted, #475467)" }}
              label={{
                value: axis.label ?? axis.unit,
                angle: -90,
                position: "insideLeft",
                style: { fill: "var(--text-muted, #475467)" },
              }}
            />
          ))}
          <Tooltip
            content={<ChartTooltip meta={dataset.meta} seriesMap={seriesMap} />}
            cursor={{ stroke: "var(--border-strong, #d0d5dd)" }}
          />
          {series.map((seriesItem) => {
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
              if (coverage >= 1) {
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
                />
              );
            }
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
              return (
                <Line
                  key={seriesItem.id}
                  type="monotone"
                  dataKey={seriesItem.id}
                  stroke={seriesItem.color}
                  strokeWidth={2}
                  dot={dotRenderer}
                  yAxisId={yAxisId}
                  hide={hidden}
                  isAnimationActive={false}
                  strokeDasharray={hasLowCoverage ? "6 4" : undefined}
                />
              );
            }
            return null;
          })}
          <Brush dataKey="x" height={24} travellerWidth={12} />
        </ComposedChart>
      </ResponsiveContainer>
      <SeriesLegend
        series={series}
        visibility={visibility}
        onToggleSeries={onToggleSeries}
      />
    </div>
  );
};
