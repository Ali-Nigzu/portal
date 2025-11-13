import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
} from "recharts";
import type { ChartSeries } from "../../../schemas/charting";
import type { ChartPrimitiveProps } from "./types";
import { buildCartesianDataset } from "./utils";
import { ChartTooltip } from "../ui/ChartTooltip";
import { SeriesLegend } from "../ui/SeriesLegend";

export const BarChartPrimitive = ({
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
        <RechartsBarChart data={dataset.data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-strong, #d0d5dd)" />
          <XAxis dataKey="x" type="category" tick={{ fill: "var(--text-muted, #475467)" }} />
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
            cursor={{ fill: "var(--surface-muted, rgba(15, 23, 42, 0.05))" }}
          />
          {series.map((seriesItem) => {
            const yAxisId = axisConfig.bindings[seriesItem.id] ?? "Y1";
            const hidden = visibility[seriesItem.id] === false;
            return (
              <Bar
                key={seriesItem.id}
                dataKey={seriesItem.id}
                yAxisId={yAxisId}
                fill={seriesItem.color}
                hide={hidden}
                isAnimationActive={false}
                stackId={seriesItem.stack}
              >
                {dataset.data.map((datum) => {
                  const meta =
                    dataset.meta[String(datum.x)]?.[seriesItem.id] ?? {};
                  const coverage = meta.coverage ?? 1;
                  const fillOpacity = coverage < 0.5 ? 0.35 : coverage < 1 ? 0.6 : 1;
                  return (
                    <Cell
                      key={`${seriesItem.id}-${String(datum.x)}`}
                      fill={seriesItem.color}
                      fillOpacity={fillOpacity}
                    />
                  );
                })}
              </Bar>
            );
          })}
        </RechartsBarChart>
      </ResponsiveContainer>
      <SeriesLegend
        series={series}
        visibility={visibility}
        onToggleSeries={onToggleSeries}
      />
    </div>
  );
};
