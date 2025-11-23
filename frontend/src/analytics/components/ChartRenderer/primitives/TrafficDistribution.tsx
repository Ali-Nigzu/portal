import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";

const sliceColors = ["#2d6cdf", "#4bcf9f", "#f4b63d", "#f97066", "#7c3aed", "#0ea5e9"];

export const TrafficDistribution = ({
  result,
  series,
  height,
  className,
  widgetId,
}: ChartPrimitiveProps) => {
  const primary = series[0];
  const data = primary?.data ?? [];
  const summary = (result.meta?.summary as Record<string, unknown> | undefined) ?? {};
  const title = typeof summary.title === "string" ? (summary.title as string) : "Traffic by Camera";
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

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[VRM] TrafficDistribution: entry", {
      isVrmTraffic,
      seriesLength: series.length,
      dataLength: data.length,
      summary,
      firstPoints: data.slice(0, 5).map((point) => ({
        x: point.x,
        value: point.value ?? point.y,
      })),
    });
  }

  if (!primary || data.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[VRM traffic] TrafficDistribution early-exit", {
        reason: !primary ? "no-primary" : "no-data",
        seriesLength: series.length,
        dataLength: data.length,
      });
    }
    return (
      <div
        className={`traffic-distribution kpi-tile ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <div className="traffic-distribution__empty">No traffic data available.</div>
      </div>
    );
  }

  const legend = data.map((point, index) => {
    const rawCamera = point.x ?? `Cam ${index + 1}`;
    const normalizedCameraId = String(rawCamera).replace(/^Cam\s*/i, "").trim();
    const cameraId = normalizedCameraId !== "" ? normalizedCameraId : String(index + 1);
    const rawValue =
      typeof point.value === "number"
        ? point.value
        : typeof point.y === "number"
        ? point.y
        : 0;
    const numericValue = Number(rawValue);
    const value = Number.isFinite(numericValue) ? numericValue : 0;
    return {
      label: `Cam ${cameraId}`,
      camId: cameraId,
      value,
      color: sliceColors[index % sliceColors.length],
    };
  });

  const totalValue = legend.reduce((total, slice) => total + slice.value, 0);
  const nonFiniteValues = legend
    .map((entry) => entry.value)
    .filter((value) => !Number.isFinite(value))
    .slice(0, 5);

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[VRM traffic] TrafficDistribution totals", {
      totalValue,
      legendCount: legend.length,
      dataCount: data.length,
      nonFiniteValues,
    });
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[VRM] TrafficDistribution: legend", { legend, totalValue, isVrmTraffic });
  }

  if (!legend.length || (totalValue <= 0 && !isVrmTraffic)) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[VRM] TrafficDistribution: empty view", {
        totalValue,
        dataLength: data.length,
        isVrmTraffic,
        reason: !legend.length ? "no-legend" : "non-positive-total",
      });
    }
    return (
      <div className={`traffic-distribution kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
        <div className="traffic-distribution__title">{title}</div>
        <div className="traffic-distribution__content">
          <div className="traffic-distribution__empty">No traffic data available.</div>
        </div>
      </div>
    );
  }

  const zeroTotalFallback = isVrmTraffic && totalValue <= 0;
  const renderLegend = zeroTotalFallback
    ? legend.map((entry) => ({
        ...entry,
        renderValue: 1,
        displayValue: 0,
      }))
    : legend.map((entry) => ({
        ...entry,
        renderValue: entry.value,
        displayValue: entry.value,
      }));
  const renderTopSlice = renderLegend.reduce((winner, candidate) =>
    candidate.renderValue >= winner.renderValue ? candidate : winner,
  renderLegend[0]);

  const pieLegend = renderLegend.map((entry) => ({ ...entry, value: entry.renderValue }));
  const centerValue = renderTopSlice.displayValue ?? renderTopSlice.value ?? 0;

  return (
    <div className={`traffic-distribution kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="traffic-distribution__title">{title}</div>
      <div className={contentClassName}>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Tooltip
              formatter={(value) => `${formatNumeric(value as number)}%`}
              labelFormatter={() => ""}
            />
            <Pie
              dataKey="value"
              data={pieLegend}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={60}
              paddingAngle={2}
              label={
                isVrmTraffic
                  ? ({ payload, value }) => {
                      const camId = (payload as { camId?: string })?.camId ?? (payload as { label?: string })?.label;
                      const shareCandidate = (payload as { displayValue?: number })?.displayValue ?? value;
                      const share = typeof shareCandidate === "number" ? Math.round(shareCandidate) : 0;
                      const cameraLabel = camId ? `Cam ${camId.replace(/^Cam\s*/i, "").trim()}` : "Cam";
                      return `${cameraLabel} ${share}%`;
                    }
                  : undefined
              }
              labelLine={isVrmTraffic ? false : undefined}
            >
              {pieLegend.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="traffic-distribution__center">
                {`${Math.round(centerValue)}%`}
              </text>
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {!isVrmTraffic ? (
          <div className="traffic-distribution__annotations" aria-label="Traffic by camera annotations">
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
