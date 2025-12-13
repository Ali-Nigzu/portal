import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

import type { ChartPrimitiveProps } from "./types";

const capacityColors = ["#2d6cdf", "#f97066", "#2f3b52"];
const overflowColors = ["#f97066", "#fbb6b1"];

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
  const title = typeof summary.title === "string" ? (summary.title as string) : "Capacity";
  const headline = summary.headlineValue as number | null | undefined;
  const centerValue = typeof headline === "number" && Number.isFinite(headline) ? headline : 0;

  const segments = ["Usage", "Peak extra", "Remaining"] as const;
  const mappedData = segments.map((segment, index) => {
    const point = data.find((entry) => String(entry.x) === segment) ?? data[index];
    const value = extractNumeric(point?.value ?? point?.y ?? 0);
    return { label: segment, value, color: capacityColors[index % capacityColors.length] };
  });

  const baseTotal = mappedData.reduce((sum, entry) => sum + entry.value, 0);
  const renderBase =
    baseTotal > 0
      ? mappedData
      : [
          { label: "Usage", value: 0, color: capacityColors[0] },
          { label: "Peak extra", value: 0, color: capacityColors[1] },
          { label: "Remaining", value: 100, color: capacityColors[2] },
        ];

  const currentPct = extractNumeric(summary.capacity_usage_now);
  const peakPct = extractNumeric(summary.peak_capacity_usage_today);
  const currentOverflow = Math.max(0, currentPct - 100);
  const peakOverflow = Math.max(0, peakPct - 100);
  const overflowNow = Math.min(currentOverflow, peakOverflow || currentOverflow);
  const overflowPeakRemainder = Math.max(0, peakOverflow - overflowNow);
  const hasOverflow = overflowNow > 0 || overflowPeakRemainder > 0;

  const overflowData = hasOverflow
    ? [
        { label: "Current overflow", value: overflowNow, color: overflowColors[0] },
        { label: "Peak overflow", value: overflowPeakRemainder, color: overflowColors[1] },
      ].filter((entry) => entry.value > 0)
    : [];

  const centerDisplay = `${Math.round(centerValue)}%`;
  const overflowLabel = currentOverflow > 0 ? `+${Math.round(currentOverflow)}% over` : null;

  const tooltipFormatter = (value: number, _name: string, props: any) => {
    const label = (props?.payload as { label?: string })?.label ?? "";
    const numericValue = Math.max(0, Math.round(extractNumeric(value)));
    if (label === "Peak extra") {
      return [`${numericValue}%`, "Peak add-on"];
    }
    if (label === "Remaining") {
      return [`${numericValue}% (capacity not reached)`, "Remaining"];
    }
    if (label === "Current overflow") {
      return [`${numericValue}% over now`, "Current overflow"];
    }
    if (label === "Peak overflow") {
      return [`${numericValue}% peak over`, "Peak overflow"];
    }
    return [`${numericValue}%`, "Current"];
  };

  return (
    <div className={`capacity-usage kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="capacity-usage__title">{title}</div>
      <div className="capacity-usage__content">
        <ResponsiveContainer width="100%" height={hasOverflow ? 164 : 140}>
          <PieChart>
            <Tooltip formatter={tooltipFormatter} labelFormatter={() => ""} />
            <Pie
              dataKey="value"
              data={renderBase}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={0}
              startAngle={90}
              endAngle={450}
              stroke="none"
            >
              {renderBase.map((entry) => (
                <Cell key={entry.label} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            {hasOverflow ? (
              <Pie
                dataKey="value"
                data={overflowData}
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={86}
                paddingAngle={0}
                startAngle={90}
                endAngle={450}
                stroke="none"
              >
                {overflowData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} stroke="none" />
                ))}
              </Pie>
            ) : null}
            <text
              x="50%"
              y={hasOverflow ? "46%" : "50%"}
              textAnchor="middle"
              dominantBaseline="middle"
              className="capacity-usage__center"
            >
              {centerDisplay}
            </text>
            {overflowLabel ? (
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="capacity-usage__subtitle"
              >
                {overflowLabel}
              </text>
            ) : null}
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
