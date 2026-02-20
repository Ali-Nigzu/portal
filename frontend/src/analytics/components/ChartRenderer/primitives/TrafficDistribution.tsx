import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";

const sliceColors = ["#0f2e63", "#1a3f80", "#25529f", "#3164bd", "#3d77db", "#4a89f2"];
const DONUT_SIZE = 140;
const DONUT_OUTER_RADIUS = 68;

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
    typeof summary.title === "string" ? (summary.title as string) : "Traffic Split";
  const topLevelChartStyle = (result as unknown as { chartStyle?: string }).chartStyle;
  const topLevelChartSubType = (result as unknown as { chartSubType?: string }).chartSubType;
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

  if (!primary || data.length === 0) {
    return (
      <div
        className={`traffic-distribution kpi-tile ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <div className="traffic-distribution__empty">Traffic Split data unavailable.</div>
      </div>
    );
  }

  const legend = data.map((point, index) => {
    const rawCamera = point.x ?? `Cam ${index + 1}`;
    const normalizedCameraId = String(rawCamera).replace(/^Cam\s*/i, "").trim();
    const cameraId = normalizedCameraId !== "" ? normalizedCameraId : String(index + 1);
    const baseLabel =
      labelKey && point && typeof point === "object"
        ? (point as unknown as Record<string, unknown>)[labelKey]
        : rawCamera;
    const rawLabel = String(baseLabel ?? rawCamera).trim() || `Slice ${index + 1}`;
    const rawValue =
      typeof point.value === "number" ? point.value : typeof point.y === "number" ? point.y : 0;
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
  if (!legend.length || totalValue <= 0) {
    return (
      <div className={`traffic-distribution kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
        <div className="traffic-distribution__title">{title}</div>
        <div className={`${contentClassName} traffic-distribution__content--empty`}>
          <div className="traffic-distribution__empty">Traffic Split data unavailable.</div>
        </div>
      </div>
    );
  }

  const renderLegend = legend.map((entry) => ({
    ...entry,
    renderValue: entry.value,
    displayValue: entry.value,
  }));
  const renderTopSlice = renderLegend.reduce(
    (winner, candidate) => (candidate.renderValue >= winner.renderValue ? candidate : winner),
    renderLegend[0],
  );
  const pieLegend = renderLegend.map((entry) => ({
    ...entry,
    value: entry.renderValue,
  }));
  const topCameraLabel =
    renderTopSlice.camId === null ||
    renderTopSlice.camId === undefined ||
    renderTopSlice.camId === ""
      ? "—"
      : String(renderTopSlice.camId);

  return (
    <div className={`traffic-distribution kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="traffic-distribution__title">{title}</div>
      <div className={contentClassName}>
        <div className="traffic-distribution__donut-wrap" data-traffic-donut-wrap style={{ position: "relative", width: DONUT_SIZE, height: DONUT_SIZE }}>
          <ResponsiveContainer width="100%" height={DONUT_SIZE}>
            <PieChart>
              <Tooltip
                formatter={(value, _name, props) => {
                  const payload = (props?.payload ?? {}) as {
                    displayValue?: number;
                  };
                  const displayValue =
                    typeof payload.displayValue === "number" ? payload.displayValue : (value as number);
                  const safeValue = Number.isFinite(displayValue) ? displayValue : 0;
                  return `${formatNumeric(Math.max(0, safeValue))}%`;
                }}
                labelFormatter={() => ""}
              />
              <Pie
                dataKey="value"
                data={pieLegend}
                nameKey={labelKey ?? undefined}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={DONUT_OUTER_RADIUS}
                paddingAngle={pieLegend.length >= 2 ? 1.5 : 0}
                startAngle={90}
                endAngle={450}
                label={undefined}
                labelLine={false}
                stroke="none"
              >
                {pieLegend.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={entry.color}
                    stroke="var(--sys-bg-1, #09111f)"
                    strokeWidth={1}
                  />
                ))}
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="traffic-distribution__center"
                >
                  {topCameraLabel}
                </text>
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <span className="traffic-distribution__anchor traffic-distribution__anchor--center" data-traffic-donut-center style={{ position: "absolute", left: "50%", top: "50%", width: 2, height: 2, transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
          <span
            className="traffic-distribution__anchor traffic-distribution__anchor--north"
            style={{ position: "absolute", left: "50%", top: `calc(50% - ${DONUT_OUTER_RADIUS}px)`, width: 2, height: 2, transform: "translate(-50%, -50%)", pointerEvents: "none" }}
            data-traffic-donut-north
            data-anchor-id="bottom-traffic"
          />
        </div>
        {!isVrmTraffic ? (
          <div
            className="traffic-distribution__annotations"
            aria-label="Traffic by camera annotations"
          >
            {renderLegend.map((entry) => (
              <div className="traffic-distribution__annotation" key={entry.label}>
                <span
                  className="traffic-distribution__annotation-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                <span className="traffic-distribution__annotation-label">{entry.label}</span>
                <span className="traffic-distribution__annotation-value">{`${Math.round(entry.displayValue ?? entry.value)}%`}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
