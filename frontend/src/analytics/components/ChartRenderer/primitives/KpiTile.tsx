import type React from "react";
import { useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  YAxis,
  ReferenceDot,
  XAxis,
} from "recharts";
import type { ChartPrimitiveProps } from "./types";
import {
  formatCoverage,
  formatNumeric,
  formatTimeOfDay,
  formatValue,
  shouldShowRawCount,
} from "../utils/format";

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
    return (
      primarySeries.data?.map((point, index) => ({
        x: point.x,
        value: point.value ?? point.y ?? null,
        index,
      })) ?? []
    );
  }, [primarySeries]);

  const [vrmHover, setVrmHover] = useState<{
    value: number | null;
    label: string;
    index: number;
  } | null>(null);
  const sparklineRef = useRef<HTMLDivElement | null>(null);

  if (!primarySeries) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[VRM traffic] KpiTile early return: no primary series");
    }
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

  const sparklineHeight = isVrm ? 64 : 48;

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
    ? (typeof summary.title === "string"
        ? (summary.title as string)
        : primarySeries?.label ?? primarySeries?.id)
    : primarySeries?.label ?? primarySeries?.id;
  const timezone = typeof result.meta?.timezone === "string" ? (result.meta?.timezone as string) : "UTC";

  const parseLabelDate = (label?: string | number) => {
    if (label === null || label === undefined || label === "") {
      return null;
    }
    const parsed = new Date(label);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  };

  const formatLabel = (label?: string | number, payload?: unknown) => {
    const tooltipEntries = Array.isArray(payload)
      ? (payload as Array<{ payload?: { x?: string | number } }>)
      : [];
    const payloadLabel = tooltipEntries[0]?.payload?.x ?? label;
    const parsedDate = parseLabelDate(payloadLabel);

    if (isVrm) {
      if (parsedDate) {
        return formatTimeOfDay(parsedDate, timezone);
      }
      return "";
    }

    if (!parsedDate) {
      return "";
    }
    const timePart = parsedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const now = new Date();
    const includeDate = parsedDate.toDateString() !== now.toDateString();
    const datePart = includeDate ? `${parsedDate.toLocaleDateString()} ` : "";
    return `${datePart}${timePart}`;
  };

  const formatPopoverLabel = (raw?: string | number) => {
    const parsed = parseLabelDate(raw);
    if (!parsed) {
      return "";
    }
    const datePart = parsed.toLocaleDateString([], {
      timeZone: timezone,
      month: "short",
      day: "numeric",
    });
    const timePart = formatTimeOfDay(parsed, timezone);
    return `${datePart} · ${timePart}`;
  };

  const applyHoverIndex = (index: number) => {
    if (!isVrm || !sparklineData.length) return;

    const clampedIndex = Math.max(0, Math.min(sparklineData.length - 1, index));
    const chosen = sparklineData[clampedIndex];
    if (!chosen) return;

    const numeric = typeof chosen.value === "number" ? chosen.value : null;
    setVrmHover({ value: numeric, label: formatPopoverLabel(chosen.x), index: clampedIndex });
  };

  const handleOverlayHover = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isVrm) return;
    const rect =
      sparklineRef.current?.getBoundingClientRect() ??
      event.currentTarget?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return;

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * Math.max(0, sparklineData.length - 1));
    applyHoverIndex(index);
  };

  const handleSparklineLeave = () => {
    if (isVrm) {
      setVrmHover(null);
    }
  };

  const hoveredPoint = vrmHover ? sparklineData[vrmHover.index] : null;
  const hoveredNumericValue =
    hoveredPoint && typeof hoveredPoint.value === "number" ? hoveredPoint.value : null;

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
  const vrmChipText =
    isVrm && typeof summary.vrmChipText === "string" ? (summary.vrmChipText as string) : null;
  const showVrmChip = Boolean(vrmChipText) && !showHeaderDelta;

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

  if (process.env.NODE_ENV !== "production" && isTraffic) {
    // eslint-disable-next-line no-console
    console.log("[VRM traffic] KpiTile input", {
      chartStyle,
      presentation,
      primarySeriesLength: primarySeries?.data?.length,
      headlineValue: summary?.headlineValue,
      hasTrafficRows: trafficRows.length > 0,
    });
  }

  return (
    <div
      className={["kpi-tile", className ?? "", isVrm ? "kpi-tile--vrm" : ""].filter(Boolean).join(" ")}
      style={isVrm ? { minHeight: height, paddingBottom: 0 } : { minHeight: height }}
    >
      <div className="kpi-header">
        {headerLabel ? <div className="kpi-label">{headerLabel}</div> : <div className="kpi-label" />}
        <div className="kpi-header-right">
          {showHeaderDelta ? deltaChip : null}
          {showVrmChip ? <div className="kpi-delta tone-neutral">{vrmChipText}</div> : null}
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
        <div
          className={`kpi-sparkline-shell${isVrm ? " kpi-sparkline-shell--vrm" : ""}`}
          onMouseLeave={isVrm ? handleSparklineLeave : undefined}
          data-testid={isVrm ? "vrm-sparkline-shell" : undefined}
          style={isVrm ? { paddingBottom: 0 } : undefined}
        >
          <div
            className={`kpi-sparkline${isVrm ? " kpi-sparkline--vrm" : ""}`}
            ref={sparklineRef}
          >
            <ResponsiveContainer width="100%" height={sparklineHeight}>
              <AreaChart
                data={sparklineData}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                onMouseLeave={isVrm ? undefined : handleSparklineLeave}
              >
                <XAxis dataKey="index" type="number" hide domain={["dataMin", "dataMax"]} />
                <YAxis type="number" domain={[0, (dataMax: number | undefined) => dataMax ?? 0]} hide />
                {!isVrm ? (
                  <Tooltip
                    formatter={(tooltipValue) => [
                      formatValue(tooltipValue as number, primarySeries.unit),
                      primarySeries.label ?? primarySeries.id ?? "",
                    ]}
                    labelFormatter={(label, payload) => formatLabel(label as string | number, payload)}
                  />
                ) : null}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={primarySeries?.color ?? "#2d6cdf"}
                  fill={primarySeries?.color ?? "#2d6cdf"}
                  fillOpacity={0.2}
                  isAnimationActive={false}
                />
                {isVrm && vrmHover && hoveredNumericValue !== null ? (
                  <ReferenceDot
                    x={sparklineData[vrmHover.index]?.index ?? vrmHover.index}
                    y={hoveredNumericValue}
                    r={5}
                    fill="#ffffff"
                    stroke={primarySeries?.color ?? "#2d6cdf"}
                    strokeWidth={2}
                    strokeOpacity={0.9}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
            {isVrm ? (
              <>
                <div
                  className="kpi-sparkline__overlay"
                  data-testid="vrm-sparkline-overlay"
                  onMouseMove={handleOverlayHover}
                  onMouseEnter={handleOverlayHover}
                  onMouseLeave={handleSparklineLeave}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {isVrm && vrmHover ? (
        <div className="kpi-sparkline-strip" aria-label="VRM sparkline hover strip">
          <div className="kpi-sparkline-strip__time">{vrmHover.label}</div>
          <div className="kpi-sparkline-strip__value">
            {formatKpiValue(vrmHover.value, primarySeries?.unit)}
          </div>
        </div>
      ) : null}
    </div>
  );
};
