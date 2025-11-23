import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";

const capacityColors = ["#2d6cdf", "#f4b63d", "#2f3b52"];

export const CapacityDonut = ({
  result,
  series,
  height,
  className,
}: ChartPrimitiveProps) => {
  const primary = series[0];
  const data = primary?.data ?? [];
  const summary = (result.meta?.summary as Record<string, unknown> | undefined) ?? {};
  const title = typeof summary.title === "string" ? (summary.title as string) : "Capacity Usage";
  const chip = typeof summary.vrmChipText === "string" ? (summary.vrmChipText as string) : undefined;
  const headline = summary.headlineValue as number | null | undefined;
  const centerValue = typeof headline === "number" && Number.isFinite(headline) ? headline : 0;

  const legend = data.map((point, index) => {
    const rawValue =
      typeof point.value === "number"
        ? point.value
        : typeof point.y === "number"
        ? point.y
        : 0;
    const value = Number.isFinite(rawValue) ? Number(rawValue) : 0;
    const label = typeof point.x === "string" ? point.x : `Segment ${index + 1}`;
    return { label, value, color: capacityColors[index % capacityColors.length] };
  });

  const total = legend.reduce((sum, entry) => sum + entry.value, 0);
  const fallbackLegend =
    legend.length > 0
      ? legend
      : [
          { label: "Usage", value: 0, color: capacityColors[0] },
          { label: "Peak extra", value: 0, color: capacityColors[1] },
          { label: "Remaining", value: 100, color: capacityColors[2] },
        ];

  const renderLegend =
    total > 0
      ? legend
      : fallbackLegend.map((entry) => ({
          ...entry,
          value: entry.label === "Remaining" ? 100 : 0,
        }));

  const renderTotal = renderLegend.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const normalizedLegend = renderLegend.map((entry) => ({
    ...entry,
    value: entry.value,
    share: (entry.value / renderTotal) * 100,
  }));

  const centerDisplay = `${Math.round(centerValue)}%`;

  return (
    <div className={`capacity-usage kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="capacity-usage__title">{title}</div>
      <div className="capacity-usage__content">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              dataKey="value"
              data={normalizedLegend}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={65}
              paddingAngle={1}
              label={({ payload }) => {
                const label = (payload as { label?: string })?.label ?? "";
                const share = (payload as { share?: number })?.share ?? 0;
                return `${label}: ${Math.round(share)}%`;
              }}
              labelLine={false}
            >
              {normalizedLegend.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="capacity-usage__center">
                {centerDisplay}
              </text>
            </Pie>
            <text x="50%" y="95%" textAnchor="middle" dominantBaseline="middle" className="capacity-usage__subtitle">
              Peak {formatNumeric(Math.round((summary.peak_capacity_usage_today as number) ?? 0))}%
            </text>
          </PieChart>
        </ResponsiveContainer>
        {chip ? <div className="capacity-usage__chip">{chip}</div> : null}
      </div>
    </div>
  );
};
