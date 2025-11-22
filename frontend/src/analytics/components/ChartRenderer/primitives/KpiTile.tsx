import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatCoverage, formatValue, shouldShowRawCount } from "../utils/format";

function formatDelta(delta: number | null | undefined): { text: string; tone: "positive" | "negative" | "neutral" } {
  if (delta === null || delta === undefined) {
    return { text: "—", tone: "neutral" };
  }
  const tone = delta === 0 ? "neutral" : delta > 0 ? "positive" : "negative";
  const symbol = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const percent = `${Math.abs(Math.round(delta * 100))}%`;
  return { text: `${symbol} ${percent}`, tone };
}

export const KpiTile = ({ series, height, className, result }: ChartPrimitiveProps) => {
  const primarySeries = series[0];
  const sparklineData = useMemo(() => {
    if (!primarySeries) {
      return [];
    }
    return primarySeries.data?.map((point) => ({
      x: point.x,
      value: point.value ?? point.y ?? null,
    })) ?? [];
  }, [primarySeries]);

  if (!primarySeries) {
    return null;
  }

  const latestPoint = primarySeries.data[primarySeries.data.length - 1];
  const value = latestPoint?.value ?? latestPoint?.y ?? null;
  const coverage = latestPoint?.coverage ?? null;
  const rawCount = (latestPoint as unknown as { rawCount?: number | null })?.rawCount ?? null;
  const deltaCandidate = primarySeries.summary?.delta;
  const delta = typeof deltaCandidate === "number" ? deltaCandidate : null;

  const formattedDelta = formatDelta(delta);
  const coverageInfo = formatCoverage(coverage);
  const showRaw = shouldShowRawCount(rawCount);
  const secondaryText =
    typeof result.meta?.summary?.secondaryText === "string"
      ? (result.meta?.summary?.secondaryText as string)
      : undefined;

  const formatLabel = (label?: string | number) => {
    if (!label) {
      return "";
    }
    const date = new Date(label);
    const timePart = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const now = new Date();
    const includeDate = date.toDateString() !== now.toDateString();
    const datePart = includeDate ? `${date.toLocaleDateString()} ` : "";
    return `${datePart}${timePart}`;
  };

  return (
    <div className={`kpi-tile ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="kpi-header">
        <div className="kpi-label">{primarySeries?.label ?? primarySeries?.id}</div>
        {primarySeries?.unit ? (
          <div className="kpi-unit">{primarySeries.unit}</div>
        ) : null}
      </div>
      <div className="kpi-value">{formatValue(value, primarySeries?.unit)}</div>
      {showRaw ? (
        <div className="kpi-meta">raw: {rawCount}</div>
      ) : null}
      {secondaryText ? <div className="kpi-meta">{secondaryText}</div> : null}
      {coverageInfo.label !== "—" ? (
        <div className={`kpi-coverage ${coverageInfo.tone}`}>
          coverage: {coverageInfo.label}
        </div>
      ) : null}
      {delta !== null ? (
        <div className={`kpi-delta tone-${formattedDelta.tone}`}>{formattedDelta.text}</div>
      ) : null}
      {sparklineData.length > 1 ? (
        <div className="kpi-sparkline">
          <ResponsiveContainer width="100%" height={48}>
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Tooltip
                formatter={(tooltipValue) => [
                  formatValue(tooltipValue as number, primarySeries.unit),
                  primarySeries.label ?? primarySeries.id ?? "",
                ]}
                labelFormatter={(label) => formatLabel(label as string | number)}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={primarySeries?.color ?? "#2d6cdf"}
                fill={primarySeries?.color ?? "#2d6cdf"}
                fillOpacity={0.2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};
