import type React from "react";
import { useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  ReferenceDot,
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
const formatUnitLabel = (unit?: string | null) =>
  unit ? unit.toUpperCase() : null;
export const KpiTile = ({
  series,
  height,
  className,
  result,
}: ChartPrimitiveProps) => {
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
  const [sparklineHover, setSparklineHover] = useState<{
    value: number | null;
    label: string;
  } | null>(null);
  const sparklineRef = useRef<HTMLDivElement | null>(null);
  if (!primarySeries) {
    if (!import.meta.env.PROD) {
      console.log("[VRM traffic] KpiTile early return: no primary series");
    }
    return null;
  }
  const latestPoint = primarySeries.data[primarySeries.data.length - 1];
  const summary =
    (result.meta?.summary as Record<string, unknown> | undefined) ?? {};
  const presentation =
    typeof summary.presentation === "string" ? summary.presentation : null;
  const isVrm = presentation === "vrm";
  const chartStyle =
    typeof summary.chartStyle === "string" ? summary.chartStyle : null;
  const isTraffic = chartStyle === "traffic_distribution";
  const headlineOverride = summary?.headlineValue as number | undefined;
  const value =
    typeof headlineOverride === "number"
      ? headlineOverride
      : (latestPoint?.value ?? latestPoint?.y ?? null);
  const compact = Boolean(summary?.compact);
  const coverage = compact ? null : (latestPoint?.coverage ?? null);
  const rawCount = compact
    ? null
    : ((latestPoint as unknown as { rawCount?: number | null })?.rawCount ??
      null);
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
  const headerLabel = isVrm
    ? typeof summary.title === "string"
      ? (summary.title as string)
      : (primarySeries?.label ?? primarySeries?.id)
    : (primarySeries?.label ?? primarySeries?.id);
  const timezone =
    typeof result.meta?.timezone === "string"
      ? (result.meta?.timezone as string)
      : "UTC";
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
    const timePart = parsedDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
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
    setVrmHover({
      value: numeric,
      label: formatPopoverLabel(chosen.x),
      index: clampedIndex,
    });
  };
  const handleOverlayHover = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isVrm) return;
    const rect =
      sparklineRef.current?.getBoundingClientRect() ??
      event.currentTarget?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const index = Math.round(ratio * Math.max(0, sparklineData.length - 1));
    applyHoverIndex(index);
  };
  const handleSparklineLeave = () => {
    if (isVrm) {
      setVrmHover(null);
    }
    setSparklineHover(null);
  };
  const handleSparklineMove = (chartState: {
    activePayload?: Array<{ payload?: { value?: number | null; y?: number | null } }>;
    activeLabel?: string | number;
  }) => {
    if (isVrm) return;
    const payload = chartState.activePayload ?? [];
    const value =
      typeof payload[0]?.payload?.value === "number"
        ? payload[0]?.payload?.value
        : typeof payload[0]?.payload?.y === "number"
          ? payload[0]?.payload?.y
          : null;
    const label = formatLabel(chartState.activeLabel ?? "", payload);
    setSparklineHover({ value, label });
  };
  const hoveredPoint = vrmHover ? sparklineData[vrmHover.index] : null;
  const hoveredNumericValue =
    hoveredPoint && typeof hoveredPoint.value === "number"
      ? hoveredPoint.value
      : null;
  const showHoverFooter = Boolean(isVrm ? vrmHover : sparklineHover);
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
  if (!import.meta.env.PROD && isTraffic) {
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
      className={["kpi-tile", className ?? "", isVrm ? "kpi-tile--vrm" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`kpi-body${isVrm ? " kpi-body--vrm" : ""}`}
        style={{ minHeight: height }}
      >
        <div
          className={["kpi-content", isVrm ? "kpi-content--vrm" : ""]
            .filter(Boolean)
            .join(" ")}
        >
        <div className="kpi-main-block">
          <div className="kpi-header">
            {" "}
            {headerLabel ? (
              <div className="kpi-label">{headerLabel}</div>
            ) : (
              <div className="kpi-label" />
            )}{" "}
            <div className="kpi-header-right">
              {" "}
              {showUnit ? (
                <div className="kpi-unit">{unitLabel}</div>
              ) : null}{" "}
            </div>
          </div>
          <div className="kpi-value">{formatHeadline()}</div>{" "}
          {showRaw ? <div className="kpi-meta">raw: {rawCount}</div> : null}{" "}
          {secondaryText ? (
            <div className="kpi-meta">{secondaryText}</div>
          ) : null}{" "}
          {tertiaryText ? (
            <div className="kpi-tertiary">{tertiaryText}</div>
          ) : null}{" "}
          {!compact && coverageInfo.label !== "—" ? (
            <div className={`kpi-coverage ${coverageInfo.tone}`}>
              {" "}
              coverage: {coverageInfo.label}{" "}
            </div>
          ) : null}{" "}
          {trafficRows.length > 0 ? (
            <div className="kpi-traffic" aria-label="Traffic distribution rows">
              {" "}
              {trafficRows}{" "}
            </div>
          ) : null}{" "}
        </div>{" "}
        {!isTraffic && sparklineData.length > 1 ? (
          <div
            className={[
              "kpi-sparkline",
              "kpi-sparkline-region",
              isVrm ? "kpi-sparkline--vrm kpi-sparkline-region--vrm" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseLeave={isVrm ? handleSparklineLeave : undefined}
            data-testid={isVrm ? "vrm-sparkline-region" : undefined}
          >
            <div
              className={`kpi-sparkline-shell${isVrm ? " kpi-sparkline-shell--vrm" : ""}`}
            >
              <div
                className={`kpi-sparkline-anchor${isVrm ? " kpi-sparkline-anchor--vrm" : ""}`}
                data-testid={isVrm ? "vrm-sparkline-shell" : undefined}
                style={isVrm ? { paddingBottom: 0 } : undefined}
                ref={sparklineRef}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={sparklineData}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    onMouseLeave={isVrm ? undefined : handleSparklineLeave}
                    onMouseMove={isVrm ? undefined : handleSparklineMove}
                  >
                    <YAxis
                      type="number"
                      domain={[
                        0,
                        (dataMax: number) => Math.max(0, dataMax),
                      ]}
                      padding={{ bottom: 0, top: 0 }}
                      allowDataOverflow={false}
                      width={0}
                      tick={false}
                      axisLine={false}
                      tickLine={false}
                    />{" "}
                    <Area
                      type="monotone"
                      dataKey="value"
                      name={primarySeries.label ?? primarySeries.id ?? ""}
                      stroke={primarySeries?.color ?? "#2d6cdf"}
                      fill={primarySeries?.color ?? "#2d6cdf"}
                      fillOpacity={0.2}
                      isAnimationActive={false}
                      baseValue={0}
                    />{" "}
                    {isVrm && vrmHover && hoveredNumericValue !== null ? (
                      <ReferenceDot
                        x={
                          sparklineData[vrmHover.index]?.index ?? vrmHover.index
                        }
                        y={hoveredNumericValue}
                        r={3.5}
                        fill="rgba(255,255,255,0.1)"
                        stroke={primarySeries?.color ?? "#2d6cdf"}
                        strokeWidth={1.5}
                        strokeOpacity={0.9}
                      />
                    ) : null}{" "}
                  </AreaChart>
                </ResponsiveContainer>{" "}
                {isVrm ? (
                  <div
                    className="kpi-sparkline__overlay"
                    data-testid="vrm-sparkline-overlay"
                    onMouseMove={handleOverlayHover}
                    onMouseEnter={handleOverlayHover}
                  />
                ) : null}{" "}
              </div>
            </div>{" "}
          </div>
        ) : null}{" "}
        </div>
      </div>
      {showHoverFooter ? (
        <div
          className={`kpi-sparkline-strip${isVrm ? " kpi-sparkline-strip--vrm" : ""}`}
          aria-label="KPI sparkline hover footer"
          data-testid={isVrm ? "vrm-sparkline-footer" : undefined}
        >
          <div className="kpi-sparkline-strip__time">
            {isVrm ? vrmHover?.label : sparklineHover?.label}
          </div>
          <div className="kpi-sparkline-strip__value">
            {isVrm
              ? formatKpiValue(vrmHover?.value ?? null, primarySeries?.unit)
              : formatValue(sparklineHover?.value ?? null, primarySeries?.unit)}
          </div>
        </div>
      ) : null}
    </div>
  );
};
