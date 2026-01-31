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
  const summary =
    (result.meta?.summary as Record<string, unknown> | undefined) ?? {};
  const title =
    typeof summary.title === "string" ? (summary.title as string) : "Capacity";
  const headline = summary.headlineValue as number | null | undefined;
  const centerValue =
    typeof headline === "number" && Number.isFinite(headline) ? headline : 0;
  const segments = ["Usage", "Peak extra", "Remaining"] as const;
  const mappedData = segments.map((segment, index) => {
    const point =
      data.find((entry) => String(entry.x) === segment) ?? data[index];
    const value = extractNumeric(point?.value ?? point?.y ?? 0);
    return {
      label: segment,
      value,
      color: capacityColors[index % capacityColors.length],
    };
  });
  const usageValue =
    mappedData.find((entry) => entry.label === "Usage")?.value ?? 0;
  const peakExtraValue =
    mappedData.find((entry) => entry.label === "Peak extra")?.value ?? 0;
  const peakTotalValue = usageValue + peakExtraValue;
  const total = mappedData.reduce((sum, entry) => sum + entry.value, 0);
  const renderData =
    total > 0
      ? mappedData
      : [
          { label: "Usage", value: 0, color: capacityColors[0] },
          { label: "Peak extra", value: 0, color: capacityColors[1] },
          { label: "Remaining", value: 100, color: capacityColors[2] },
        ];
  const renderTotal =
    renderData.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const normalizedData = renderData.map((entry) => ({
    ...entry,
    share: (entry.value / renderTotal) * 100,
  }));
  const centerDisplay = `${Math.round(centerValue)}%`;
  const tooltipFormatter = (_value: any, _name: string, props: any) => {
    const label = (props?.payload as { label?: string })?.label ?? "";
    if (label === "Remaining") {
      return null;
    }
    if (label === "Peak extra") {
      return [`${Math.max(0, Math.round(peakTotalValue))}%`, "Peak"] as const;
    }
    if (label === "Usage") {
      return [`${Math.max(0, Math.round(usageValue))}%`, "Current"] as const;
    }
    return null;
  };
  return (
    <div
      className={`capacity-usage kpi-tile ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      <div className="capacity-usage__title">{title}</div>
      <div className="capacity-usage__content">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Tooltip
              formatter={tooltipFormatter}
              labelFormatter={() => ""}
              filterNull
            />
            <Pie
              dataKey="value"
              data={normalizedData}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={0}
              startAngle={90}
              endAngle={450}
              stroke="none"
            >
              {normalizedData.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={entry.color}
                  stroke="none"
                  style={
                    entry.label === "Remaining"
                      ? { pointerEvents: "none" }
                      : undefined
                  }
                />
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
