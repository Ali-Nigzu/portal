import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";

const DEFAULT_SLICE_COLORS = [
  "#2d6cdf",
  "#4bcf9f",
  "#f4b63d",
  "#f97066",
  "#7c3aed",
  "#0ea5e9",
];

const VRM_SLICE_COLORS = ["#7EA6DC", "#3F78C1", "#1F3F73"];
const PREVIEW_SLICE_COLORS = ["#dce3eb", "#aebac9", "#738297", "#5e6c80"];
const EMPTY_RING_COLOR = "rgba(96, 122, 165, 0.28)";

const DonutHoverText = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { label?: string; displayValue?: number; value?: number } }>;
}) => {
  if (!active || !payload?.length) {
    return null;
  }
  const first = payload[0]?.payload;
  if (!first) {
    return null;
  }
  const displayValue = typeof first.displayValue === "number"
    ? first.displayValue
    : (typeof first.value === "number" ? first.value : 0);
  const value = Number.isFinite(displayValue) ? displayValue : 0;
  return (
    <div
      style={{
        background: "transparent",
        border: "none",
        boxShadow: "none",
        padding: 0,
        color: "var(--text-strong, #16181b)",
        fontWeight: 600,
        fontSize: "12px",
      }}
    >
      {`${first.label ?? ""} ${formatNumeric(Math.max(0, value))}%`.trim()}
    </div>
  );
};

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
  const isPreviewPalette =
    typeof className === "string" &&
    className.includes("dashboard-v2__kpi-renderer--preview");
  const isLandingPreviewTraffic =
    typeof className === "string" &&
    className.includes("dashboard-v2__kpi-renderer--landing-preview-traffic");
  const palette = isPreviewPalette
    ? PREVIEW_SLICE_COLORS
    : isVrmTraffic
      ? VRM_SLICE_COLORS
      : DEFAULT_SLICE_COLORS;

  if (!primary || data.length === 0) {
    return (
      <div
        className={`traffic-distribution kpi-tile ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <div className="traffic-distribution__title">{title}</div>
        <div className="traffic-distribution__empty">
          Traffic Split data unavailable.
        </div>
      </div>
    );
  }

  const legend = data.map((point, index) => {
    const rawCamera = point.x ?? `Cam ${index + 1}`;
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
      typeof point.value === "number"
        ? point.value
        : typeof point.y === "number"
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
      color: palette[index % palette.length],
    };
  });

  const totalValue = legend.reduce((total, slice) => total + slice.value, 0);
  const hasPositiveTraffic = totalValue > 0;

  const renderLegend = hasPositiveTraffic
    ? legend.map((entry) => ({
      ...entry,
      renderValue: entry.value,
      displayValue: entry.value,
    }))
    : [{
      label: "No traffic",
      camId: "—",
      value: 1,
      color: EMPTY_RING_COLOR,
      renderValue: 1,
      displayValue: 0,
    }];
  const renderTopSlice = renderLegend.reduce(
    (winner, candidate) =>
      candidate.renderValue >= winner.renderValue ? candidate : winner,
    renderLegend[0],
  );
  const pieLegend = renderLegend.map((entry) => ({
    ...entry,
    value: entry.renderValue,
  }));
  const topCameraLabel = hasPositiveTraffic
    ? (
      renderTopSlice.camId === null ||
      renderTopSlice.camId === undefined ||
      renderTopSlice.camId === ""
        ? "—"
        : String(renderTopSlice.camId)
    )
    : "—";

  return (
    <div
      className={`traffic-distribution kpi-tile ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      <div className="traffic-distribution__title">{title}</div>
      <div className={contentClassName}>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Tooltip
              cursor={false}
              content={<DonutHoverText />}
              wrapperStyle={{ background: "transparent", border: "none", boxShadow: "none" }}
            />
            <Pie
              dataKey="value"
              data={pieLegend}
              nameKey={labelKey ?? undefined}
              cx="50%"
              cy="50%"
              innerRadius={isLandingPreviewTraffic ? 0 : 48}
              outerRadius={68}
              paddingAngle={0}
              startAngle={90}
              endAngle={450}
              label={undefined}
              labelLine={false}
              stroke={isLandingPreviewTraffic ? "rgba(15, 23, 42, 0.2)" : "none"}
              strokeWidth={isLandingPreviewTraffic ? 1 : 0}
              isAnimationActive={false}
            >
              {pieLegend.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={entry.color}
                  stroke={isLandingPreviewTraffic ? "rgba(15, 23, 42, 0.2)" : "none"}
                  strokeWidth={isLandingPreviewTraffic ? 1 : 0}
                />
              ))}
              {!isLandingPreviewTraffic ? (
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="traffic-distribution__center"
                >
                  {topCameraLabel}
                </text>
              ) : null}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {!isVrmTraffic && hasPositiveTraffic ? (
          <div
            className="traffic-distribution__annotations"
            aria-label="Traffic by camera annotations"
          >
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
                <span className="traffic-distribution__annotation-value">{`${Math.round(
                  entry.displayValue ?? entry.value,
                )}%`}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
