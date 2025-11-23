import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

import type { ChartPrimitiveProps } from "./types";

const capacityColors = ["#2d6cdf", "#f97066", "#2f3b52"];

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
  const headline = summary.headlineValue as number | null | undefined;
  const centerValue = typeof headline === "number" && Number.isFinite(headline) ? headline : 0;

  const segments = ["Usage", "Peak extra", "Remaining"] as const;
  const mappedData = segments.map((segment, index) => {
    const point = data.find((entry) => String(entry.x) === segment) ?? data[index];
    const value = extractNumeric(point?.value ?? point?.y ?? 0);
    return { label: segment, value, color: capacityColors[index % capacityColors.length] };
  });

  const total = mappedData.reduce((sum, entry) => sum + entry.value, 0);
  const renderData =
    total > 0
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

  const tooltipFormatter = (value: number, _name: string, props: any) => {
    const label = (props?.payload as { label?: string })?.label ?? "";
    const baseLabel = label === "Peak extra" ? "Peak add-on" : label === "Usage" ? "Current" : "Remaining";
    const numericValue = Math.max(0, Math.round(extractNumeric(value)));
    const valueLabel =
      label === "Remaining"
        ? `${numericValue}% (capacity not reached)`
        : `${numericValue}%`;
    return [valueLabel, baseLabel];
  };

  return (
    <div className={`capacity-usage kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="capacity-usage__title">{title}</div>
      <div className="capacity-usage__content">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Tooltip formatter={tooltipFormatter} labelFormatter={() => ""} />
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
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
