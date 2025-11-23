import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";

const capacityColors = ["#2d6cdf", "#f4b63d", "#2f3b52"];

const extractNumeric = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const LABEL_COPY: Record<string, string> = {
  Usage: "Current",
  "Peak extra": "Peak +",
  Remaining: "Remaining",
};

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

  const segments = ["Usage", "Peak extra", "Remaining"] as const;
  const mappedData = segments.map((segment, index) => {
    const point = data.find((entry) => String(entry.x) === segment) ?? data[index];
    const value = extractNumeric(point?.value ?? point?.y ?? 0);
    return { label: segment, value, color: capacityColors[index % capacityColors.length] };
  });

  const total = mappedData.reduce((sum, entry) => sum + entry.value, 0);
  const renderData = total > 0
    ? mappedData
    : [
        { label: "Usage", value: 0, color: capacityColors[0] },
        { label: "Peak extra", value: 0, color: capacityColors[1] },
        { label: "Remaining", value: 100, color: capacityColors[2] },
      ];

  const renderTotal = renderData.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const normalizedData = renderData.map((entry) => ({
    ...entry,
    share: (entry.value / renderTotal) * 100,
  }));

  const centerDisplay = `${Math.round(centerValue)}%`;

  const RADIAN = Math.PI / 180;
  const renderArcLabel = (props: any) => {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, payload } = props ?? {};
    const radius = outerRadius + 18;
    const angle = -midAngle * RADIAN;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const label = payload?.label ?? "";
    const labelPrefix = LABEL_COPY[label] ?? label;
    const value = Math.max(0, Math.round(extractNumeric(payload?.value)));
    const textAnchor = x >= cx ? "start" : "end";
    return (
      <text
        x={x}
        y={y}
        fill="var(--vrm-color-text-primary, #ffffff)"
        textAnchor={textAnchor}
        dominantBaseline="central"
        className="capacity-usage__arc-label"
      >
        {`${labelPrefix} ${value}%`}
      </text>
    );
  };

  return (
    <div className={`capacity-usage kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="capacity-usage__title">{title}</div>
      <div className="capacity-usage__content">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              dataKey="value"
              data={normalizedData}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={0}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              label={renderArcLabel}
              labelLine={{ stroke: "var(--vrm-color-text-muted, #8290a6)", strokeWidth: 1 }}
            >
              {normalizedData.map((entry) => (
                <Cell key={entry.label} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="capacity-usage__center"
            >
              {centerDisplay}
            </text>
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
