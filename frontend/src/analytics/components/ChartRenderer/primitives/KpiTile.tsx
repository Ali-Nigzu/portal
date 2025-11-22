import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatCoverage, formatNumeric, formatValue, shouldShowRawCount } from "../utils/format";

const formatKpiValue = (value: number | null | undefined, unit?: string) => {
  const numeric = formatNumeric(value);
  if (numeric === "—") {
    return numeric;
  }
  return unit === "percentage" ? `${numeric}%` : numeric;
};

const formatUnitLabel = (unit?: string | null) => (unit ? unit.toUpperCase() : null);

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
  const summary = (result.meta?.summary as Record<string, unknown> | undefined) ?? {};
  const presentation = typeof summary.presentation === "string" ? summary.presentation : null;
  const isVrm = presentation === "vrm";
  const chartStyle = typeof summary.chartStyle === "string" ? summary.chartStyle : null;
  const isTraffic = chartStyle === "traffic_distribution";
  const headlineOverride = summary?.headlineValue as number | undefined;
  const value = typeof headlineOverride === "number" ? headlineOverride : latestPoint?.value ?? latestPoint?.y ?? null;
  const compact = Boolean(summary?.compact);
  const coverage = compact ? null : latestPoint?.coverage ?? null;
  const rawCount = compact ? null : (latestPoint as unknown as { rawCount?: number | null })?.rawCount ?? null;
  const deltaCandidate = primarySeries.summary?.delta;
  const delta = typeof deltaCandidate === "number" ? deltaCandidate : null;

  const formattedDelta = formatDelta(delta);
  const coverageInfo = formatCoverage(coverage);
  const showRaw = !compact && shouldShowRawCount(rawCount);
  const secondaryText =
    typeof result.meta?.summary?.secondaryText === "string"
      ? (result.meta?.summary?.secondaryText as string)
      : undefined;
  const tertiaryText =
    typeof result.meta?.summary?.tertiaryText === "string"
      ? (result.meta?.summary?.tertiaryText as string)
      : undefined;
  const hideDelta = Boolean(result.meta?.summary?.hideDelta);
  const headerLabel = isVrm
    ? (typeof summary.title === "string" ? (summary.title as string) : null)
    : primarySeries?.label ?? primarySeries?.id;

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

  const formatHeadline = () => {
    if (value === null || value === undefined) {
      return formatKpiValue(value, primarySeries?.unit);
    }
    if (isVrm && primarySeries?.unit === "minutes") {
      const rounded = Math.round(value);
      return `${rounded} min`;
    }
    return formatKpiValue(value, primarySeries?.unit);
  };

  const unitLabel = formatUnitLabel(primarySeries?.unit);
  const showUnit = Boolean(unitLabel && !isVrm);
  const deltaChip =
    delta !== null ? (
      <div className={`kpi-delta tone-${formattedDelta.tone}`}>{formattedDelta.text}</div>
    ) : null;
  const showHeaderDelta = isVrm && !isTraffic && !hideDelta && delta !== null;

  const trafficRows =
    isTraffic && primarySeries?.data?.length
      ? primarySeries.data.map((point, index) => {
          const label = String(point.x ?? `Cam ${index + 1}`);
          const share =
            typeof point.value === "number"
              ? point.value
              : typeof point.y === "number"
              ? point.y
              : 0;
          const width = Math.max(0, Math.min(100, Number(share)));
          return (
            <div className="kpi-traffic-row" key={`${label}-${index}`}>
              <div className="kpi-traffic-label">{label}</div>
              <div className="kpi-traffic-bar">
                <span style={{ width: `${width}%` }} />
              </div>
              <div className="kpi-traffic-value">{`${Math.round(Number(share))}%`}</div>
            </div>
          );
        })
      : [];

  return (
    <div
      className={["kpi-tile", className ?? "", isVrm ? "kpi-tile--vrm" : ""].filter(Boolean).join(" ")}
      style={{ minHeight: height }}
    >
      <div className="kpi-header">
        {headerLabel ? <div className="kpi-label">{headerLabel}</div> : <div className="kpi-label" />}
        <div className="kpi-header-right">
          {showHeaderDelta ? deltaChip : null}
          {showUnit ? <div className="kpi-unit">{unitLabel}</div> : null}
        </div>
      </div>
      <div className="kpi-value">{formatHeadline()}</div>
      {showRaw ? <div className="kpi-meta">raw: {rawCount}</div> : null}
      {secondaryText ? <div className="kpi-meta">{secondaryText}</div> : null}
      {tertiaryText ? <div className="kpi-tertiary">{tertiaryText}</div> : null}
      {!compact && coverageInfo.label !== "—" ? (
        <div className={`kpi-coverage ${coverageInfo.tone}`}>
          coverage: {coverageInfo.label}
        </div>
      ) : null}
      {!isVrm && !hideDelta && delta !== null ? (
        <div className={`kpi-delta tone-${formattedDelta.tone}`}>{formattedDelta.text}</div>
      ) : null}
      {trafficRows.length > 0 ? (
        <div className="kpi-traffic" aria-label="Traffic distribution rows">
          {trafficRows}
        </div>
      ) : null}
      {!isTraffic && sparklineData.length > 1 ? (
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
