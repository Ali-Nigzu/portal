import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";
const sliceColors = [
  "#1f3f78",
  "#2b5da8",
  "#3b77c8",
];

const DONUT_INNER_RADIUS = 42;
const DONUT_OUTER_RADIUS = 58;
export const TrafficDistribution = ({
  result,
  series,
  height,
  className,
  widgetId,
  useRawLabels = false,
  labelKey,
}: ChartPrimitiveProps) => {
  const primary = series[0];
  const data = primary?.data ?? [];
  const summary =
    (result.meta?.summary as Record<string, unknown> | undefined) ?? {};
  const title =
    typeof summary.title === "string"
      ? (summary.title as string)
      : "Traffic Split";
  const topLevelChartStyle = (result as unknown as { chartStyle?: string })
    .chartStyle;
  const topLevelChartSubType = (result as unknown as { chartSubType?: string })
    .chartSubType;
  const summaryChartStyle = summary.chartStyle as string | undefined;
  const summaryChartSubType = summary.chartSubType as string | undefined;
  const hasTrafficStyle =
    summaryChartStyle === "traffic_distribution" ||
    summaryChartSubType === "traffic_distribution" ||
    topLevelChartStyle === "traffic_distribution" ||
    topLevelChartSubType === "traffic_distribution";
  const isVrmTraffic =
    typeof summary.presentation === "string" &&
    summary.presentation === "vrm" &&
    (hasTrafficStyle || widgetId === "kpi-vrm-traffic");
  const contentClassName = `traffic-distribution__content${
    isVrmTraffic ? " traffic-distribution__content--vrm" : ""
  }`;
  const tupleData = Array.from({ length: 3 }, (_, index) => data[index]);
  const legend = tupleData.map((point, index) => {
    const rawCamera = point?.x ?? `Cam ${index + 1}`;
    const normalizedCameraId = String(rawCamera)
      .replace(/^Cam\s*/i, "")
      .trim();
    const cameraId =
      normalizedCameraId !== "" ? normalizedCameraId : String(index + 1);
    const baseLabel =
      labelKey && point && typeof point === "object"
        ? (point as unknown as Record<string, unknown>)[labelKey]
        : rawCamera;
    const rawLabel =
      String(baseLabel ?? rawCamera).trim() || `Slice ${index + 1}`;
    const rawValue =
      typeof point?.value === "number"
        ? point.value
        : typeof point?.y === "number"
          ? point.y
          : 0;
    const numericValue = Number(rawValue);
    const value = Number.isFinite(numericValue) ? numericValue : 0;
    const label = useRawLabels || labelKey ? rawLabel : `Cam ${cameraId}`;
    const cleanCamId = normalizedCameraId.replace(/^\D+/, "");
    return {
      label,
      camId: useRawLabels || labelKey ? rawLabel : cleanCamId || cameraId,
      value,
      color: sliceColors[index % sliceColors.length],
    };
  });
  const totalValue = legend.reduce((total, slice) => total + slice.value, 0);
  const renderLegend = legend.map((entry) => ({
    ...entry,
    renderValue: entry.value,
    displayValue: entry.value,
  }));
  const renderTopSlice = renderLegend.reduce(
    (winner, candidate) =>
      candidate.renderValue >= winner.renderValue ? candidate : winner,
    renderLegend[0],
  );
  const pieLegend = renderLegend.map((entry) => ({
    ...entry,
    value: entry.renderValue,
  }));
  const isEmptyRing = totalValue <= 0;
  const donutData = isEmptyRing
    ? [{ label: "Empty", value: 1, color: "rgba(61, 95, 145, 0.18)", camId: "—", displayValue: 0 }]
    : pieLegend;
  const topCameraLabel =
    renderTopSlice.camId === null ||
    renderTopSlice.camId === undefined ||
    renderTopSlice.camId === ""
      ? "—"
      : String(renderTopSlice.camId);
  return (
    <div
      className={`traffic-distribution kpi-tile ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      <div className="traffic-distribution__title">{title}</div>
      <div className={contentClassName} data-traffic-donut="true" data-traffic-donut-radius={DONUT_OUTER_RADIUS}>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Tooltip
              formatter={(value, _name, props) => {
                const payload = (props?.payload ?? {}) as {
                  displayValue?: number;
                };
                const displayValue =
                  typeof payload.displayValue === "number"
                    ? payload.displayValue
                    : (value as number);
                const safeValue = Number.isFinite(displayValue)
                  ? displayValue
                  : 0;
                return `${formatNumeric(Math.max(0, safeValue))}%`;
              }}
              labelFormatter={() => ""}
            />
            <Pie
              dataKey="value"
              data={donutData}
              nameKey={labelKey ?? undefined}
              cx="50%"
              cy="50%"
              innerRadius={DONUT_INNER_RADIUS}
              outerRadius={DONUT_OUTER_RADIUS}
              paddingAngle={isEmptyRing ? 0 : 1.25}
              startAngle={90}
              endAngle={450}
              label={undefined}
              labelLine={false}
              stroke={isEmptyRing ? "none" : "rgba(11, 24, 44, 0.9)"}
              strokeWidth={isEmptyRing ? 0 : 1}
              isAnimationActive={false}
            >
              {donutData.map((entry) => (
                <Cell key={entry.label} fill={entry.color} stroke="none" />
              ))}
              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="traffic-distribution__center"
              >
                {" "}
                {topCameraLabel}{" "}
              </text>
            </Pie>
          </PieChart>
        </ResponsiveContainer>{" "}
        {!isVrmTraffic ? (
          <div
            className="traffic-distribution__annotations"
            aria-label="Traffic by camera annotations"
          >
            {" "}
            {renderLegend.map((entry) => (
              <div
                className="traffic-distribution__annotation"
                key={entry.label}
              >
                <span
                  className="traffic-distribution__annotation-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                <span className="traffic-distribution__annotation-label">
                  {entry.label}
                </span>
                <span className="traffic-distribution__annotation-value">{`${Math.round(entry.displayValue ?? entry.value)}%`}</span>
              </div>
            ))}{" "}
          </div>
        ) : null}{" "}
      </div>
    </div>
  );
};
