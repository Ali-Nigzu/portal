import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";

const sliceColors = ["#2d6cdf", "#4bcf9f", "#f4b63d", "#f97066", "#7c3aed", "#0ea5e9"];

export const TrafficDistribution = ({ result, series, height, className }: ChartPrimitiveProps) => {
  const primary = series[0];
  const data = primary?.data ?? [];
  const summary = (result.meta?.summary as Record<string, unknown> | undefined) ?? {};
  const title = typeof summary.title === "string" ? (summary.title as string) : "Traffic by Camera";

  if (!primary || data.length === 0) {
    return (
      <div
        className={`traffic-distribution kpi-tile ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <div className="traffic-distribution__empty">No traffic data available.</div>
      </div>
    );
  }

  const legend = data.map((point, index) => ({
    label: String(point.x ?? `Cam ${index + 1}`),
    value: typeof point.value === "number" ? point.value : typeof point.y === "number" ? point.y : 0,
    color: sliceColors[index % sliceColors.length],
  }));

  const topSlice = legend.reduce((winner, candidate) =>
    candidate.value >= winner.value ? candidate : winner,
  legend[0]);

  return (
    <div className={`traffic-distribution kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="traffic-distribution__title">{title}</div>
      <div className="traffic-distribution__content">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Tooltip
              formatter={(value) => `${formatNumeric(value as number)}%`}
              labelFormatter={() => ""}
            />
            <Pie
              dataKey="value"
              data={legend}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={60}
              paddingAngle={2}
            >
              {legend.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="traffic-distribution__center">
                {`${Math.round(topSlice.value)}%`}
              </text>
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="traffic-distribution__legend" aria-label="Traffic distribution legend">
          {legend.map((entry) => (
            <div className="traffic-distribution__legend-item" key={entry.label}>
              <span
                className="traffic-distribution__legend-swatch"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="traffic-distribution__legend-label">{entry.label}</span>
              <span className="traffic-distribution__legend-value">{`${Math.round(entry.value)}%`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
