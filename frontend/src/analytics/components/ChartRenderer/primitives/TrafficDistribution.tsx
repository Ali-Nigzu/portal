import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { formatNumeric } from "../utils/format";
import { useDonutHoverController } from "./useDonutHoverController";
import { DonutTooltipCard, type DonutTooltipRow } from "./DonutTooltipCard";
import { useDemoDonutTooltipOwner } from "./DemoDonutTooltipOwnerContext";

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

export const TrafficDistribution = ({
  result,
  series,
  height,
  className,
  widgetId,
  useRawLabels = false,
  labelKey,
  donutTooltipMode = "legacy",
  donutTooltipOwnerId,
}: ChartPrimitiveProps) => {
  const isDemoCursorHover = donutTooltipMode === "demo_cursor_hover";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartSurfaceRef = useRef<HTMLDivElement | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);
  const donutTooltipOwner = useDemoDonutTooltipOwner();
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
    const pointColor =
      typeof (point as unknown as Record<string, unknown>).color === "string"
        ? ((point as unknown as Record<string, unknown>).color as string)
        : null;
    const label = useRawLabels || labelKey ? rawLabel : `Cam ${cameraId}`;
    const cleanCamId = normalizedCameraId.replace(/^\D+/, "");
    return {
      label,
      camId: useRawLabels || labelKey ? rawLabel : cleanCamId || cameraId,
      value,
      color: pointColor ?? palette[index % palette.length],
    };
  });

  const totalValue = legend.reduce((total, slice) => total + slice.value, 0);
  const hasPositiveTraffic = totalValue > 0;
  const donutInnerRadius = isLandingPreviewTraffic ? 0 : 48;
  const donutOuterRadius = 68;
  const donutChartHeight = 140;

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
  const hoverController = useDonutHoverController({
    enabled: isDemoCursorHover,
    geometry: {
      innerRadius: donutInnerRadius,
      outerRadius: donutOuterRadius,
      startAngle: 90,
      endAngle: 450,
    },
    segments: pieLegend.map((entry) => ({
      id: entry.label,
      value: entry.value,
      interactive: hasPositiveTraffic,
    })),
  });
  const topCameraLabel = hasPositiveTraffic
    ? (
      renderTopSlice.camId === null ||
      renderTopSlice.camId === undefined ||
      renderTopSlice.camId === ""
        ? "—"
        : String(renderTopSlice.camId)
    )
    : "—";
  const [legacyHoverLabel, setLegacyHoverLabel] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const hoveredSlice = pieLegend.find((entry) => entry.label === hoverController.activeSegmentId);
  const tooltipRows = useMemo<DonutTooltipRow[]>(() => {
    if (!isDemoCursorHover || !hasPositiveTraffic) {
      return [];
    }
    return pieLegend.map((entry) => ({
      id: entry.label,
      label: entry.label,
      valueText: `${formatNumeric(Math.max(0, Number(entry.displayValue ?? entry.value) || 0))}%`,
      color: entry.color,
      isActive: hoverController.activeSegmentId === entry.label,
      interactive: true,
    }));
  }, [hasPositiveTraffic, hoverController.activeSegmentId, isDemoCursorHover, pieLegend]);
  const hoverLabelText = useMemo(() => {
    if (isDemoCursorHover) {
      if (!hoverController.isTooltipVisible || !hoveredSlice) {
        return "";
      }
      const value =
        typeof hoveredSlice.displayValue === "number"
          ? hoveredSlice.displayValue
          : hoveredSlice.value;
      return `${hoveredSlice.label} ${formatNumeric(Math.max(0, Number(value) || 0))}%`.trim();
    }
    if (!legacyHoverLabel) {
      return "";
    }
    return legacyHoverLabel.text;
  }, [hoverController.isTooltipVisible, hoveredSlice, isDemoCursorHover, legacyHoverLabel]);
  const localTooltipVisible = isDemoCursorHover &&
    hoverController.isTooltipVisible &&
    hoveredSlice !== undefined &&
    tooltipRows.length > 0;
  const isOwnedTooltip = !donutTooltipOwnerId || !donutTooltipOwner
    ? true
    : donutTooltipOwner.activeOwnerId === donutTooltipOwnerId;
  const isDemoTooltipVisible = localTooltipVisible && isOwnedTooltip;

  useEffect(() => {
    if (!isDemoCursorHover || !donutTooltipOwner || !donutTooltipOwnerId) {
      return;
    }
    if (localTooltipVisible) {
      donutTooltipOwner.claim(donutTooltipOwnerId);
      return;
    }
    donutTooltipOwner.release(donutTooltipOwnerId);
  }, [donutTooltipOwner, donutTooltipOwnerId, isDemoCursorHover, localTooltipVisible]);

  const clearDemoHover = () => {
    hoverController.clearHover();
    if (donutTooltipOwner && donutTooltipOwnerId) {
      donutTooltipOwner.release(donutTooltipOwnerId);
    }
  };
  const tooltipPosition = useMemo(() => {
    const container = chartSurfaceRef.current;
    const tooltipRect = hoverLabelRef.current?.getBoundingClientRect();
    if (!container) {
      return null;
    }
    if (isDemoCursorHover) {
      return hoverController.getTooltipPosition(
        {
          width: container.clientWidth,
          height: container.clientHeight || donutChartHeight,
        },
        {
          width: tooltipRect?.width ?? 132,
          height: tooltipRect?.height ?? 20,
        },
        { x: 12, y: 12 },
        4,
        {
          centerX: container.clientWidth / 2,
          centerY: (container.clientHeight || donutChartHeight) / 2,
          radius: donutOuterRadius + 10,
        },
      );
    }
    return legacyHoverLabel
      ? { x: legacyHoverLabel.x, y: legacyHoverLabel.y }
      : null;
  }, [hoverController, isDemoCursorHover, legacyHoverLabel]);
  const placeHoverLabel = (
    entryIndex: number,
    shape: { cx?: unknown; cy?: unknown; outerRadius?: unknown; midAngle?: unknown },
  ) => {
    if (isDemoCursorHover) {
      return;
    }
    const hovered = pieLegend[entryIndex];
    if (!hovered) {
      setLegacyHoverLabel(null);
      return;
    }
    const value = typeof hovered.displayValue === "number" ? hovered.displayValue : hovered.value;
    const safeValue = Number.isFinite(value) ? value : 0;
    const text = `${hovered.label} ${formatNumeric(Math.max(0, safeValue))}%`.trim();
    const container = containerRef.current;
    if (!container) {
      setLegacyHoverLabel({ text, x: 0, y: 0 });
      return;
    }
    const cx = typeof shape.cx === "number" ? shape.cx : container.clientWidth / 2;
    const cy = typeof shape.cy === "number" ? shape.cy : 70;
    const outerRadius = typeof shape.outerRadius === "number" ? shape.outerRadius : 68;
    const midAngle = typeof shape.midAngle === "number" ? shape.midAngle : 0;
    const theta = (-midAngle * Math.PI) / 180;
    const anchorRadius = outerRadius + 14;
    const anchorX = cx + Math.cos(theta) * anchorRadius;
    const anchorY = cy + Math.sin(theta) * anchorRadius;
    const labelRect = hoverLabelRef.current?.getBoundingClientRect();
    const labelWidth = labelRect?.width ?? 120;
    const labelHeight = labelRect?.height ?? 18;
    const edgePadding = 4;
    let nextX = anchorX - labelWidth / 2;
    let nextY = anchorY - labelHeight / 2;
    const maxX = Math.max(edgePadding, container.clientWidth - labelWidth - edgePadding);
    const maxY = Math.max(edgePadding, container.clientHeight - labelHeight - edgePadding);
    nextX = Math.min(maxX, Math.max(edgePadding, nextX));
    nextY = Math.min(maxY, Math.max(edgePadding, nextY));
    const labelCenterX = nextX + labelWidth / 2;
    const labelCenterY = nextY + labelHeight / 2;
    const minRadius = outerRadius + 4;
    const distance = Math.hypot(labelCenterX - cx, labelCenterY - cy);
    if (distance < minRadius) {
      const safeDistance = distance || 1;
      const push = (minRadius - safeDistance);
      const unitX = (labelCenterX - cx) / safeDistance;
      const unitY = (labelCenterY - cy) / safeDistance;
      const adjustedCenterX = labelCenterX + unitX * push;
      const adjustedCenterY = labelCenterY + unitY * push;
      nextX = adjustedCenterX - labelWidth / 2;
      nextY = adjustedCenterY - labelHeight / 2;
      nextX = Math.min(maxX, Math.max(edgePadding, nextX));
      nextY = Math.min(maxY, Math.max(edgePadding, nextY));
    }
    setLegacyHoverLabel({ text, x: nextX, y: nextY });
  };

  return (
    <div
      className={`traffic-distribution kpi-tile ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      <div className="traffic-distribution__title">{title}</div>
      <div
        className={contentClassName}
        ref={containerRef}
        style={{ position: "relative" }}
      >
        <div
          ref={chartSurfaceRef}
          style={{
            position: "relative",
            height: donutChartHeight,
            width: donutChartHeight,
            minWidth: donutChartHeight,
          }}
          onPointerMove={isDemoCursorHover
            ? (event) => {
              const surface = chartSurfaceRef.current;
              if (!surface) {
                return;
              }
              hoverController.updateFromPointerEvent(event, {
                width: surface.clientWidth,
                height: surface.clientHeight || donutChartHeight,
              });
            }
            : undefined}
          onPointerLeave={isDemoCursorHover ? clearDemoHover : undefined}
          onMouseLeave={isDemoCursorHover ? clearDemoHover : undefined}
          onPointerCancel={isDemoCursorHover ? clearDemoHover : undefined}
          onBlur={isDemoCursorHover ? clearDemoHover : undefined}
          onClick={isDemoCursorHover ? clearDemoHover : undefined}
        >
          {isDemoCursorHover ? (
            isDemoTooltipVisible ? (
              <div
                ref={hoverLabelRef}
                style={{
                  position: "absolute",
                  left: `${tooltipPosition?.x ?? 0}px`,
                  top: `${tooltipPosition?.y ?? 0}px`,
                  transform: "translate3d(0, 0, 0)",
                  transition: "transform 80ms linear, left 80ms linear, top 80ms linear",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                <DonutTooltipCard rows={tooltipRows} />
              </div>
            ) : null
          ) : hoverLabelText ? (
            <div
              ref={hoverLabelRef}
              aria-live="polite"
              style={{
                position: "absolute",
                left: `${tooltipPosition?.x ?? 0}px`,
                top: `${tooltipPosition?.y ?? 0}px`,
                pointerEvents: "none",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-strong, #16181b)",
                zIndex: 2,
                whiteSpace: "nowrap",
              }}
            >
              {hoverLabelText}
            </div>
          ) : null}
          <ResponsiveContainer width="100%" height={donutChartHeight}>
            <PieChart>
              <Pie
              dataKey="value"
              data={pieLegend}
              nameKey={labelKey ?? undefined}
              cx="50%"
              cy="50%"
              innerRadius={donutInnerRadius}
              outerRadius={donutOuterRadius}
              paddingAngle={0}
              startAngle={90}
              endAngle={450}
              label={undefined}
              labelLine={false}
              stroke={isLandingPreviewTraffic ? "rgba(15, 23, 42, 0.2)" : "none"}
              strokeWidth={isLandingPreviewTraffic ? 1 : 0}
              isAnimationActive={false}
              rootTabIndex={-1}
              onMouseEnter={(shape, index) => {
                placeHoverLabel(index, shape ?? {});
              }}
              onMouseMove={(shape, index) => {
                placeHoverLabel(index, shape ?? {});
              }}
              onMouseLeave={() => {
                setLegacyHoverLabel(null);
              }}
              style={{ cursor: "default" }}
            >
              {pieLegend.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={entry.color}
                  stroke={isLandingPreviewTraffic ? "rgba(15, 23, 42, 0.2)" : "none"}
                  strokeWidth={isLandingPreviewTraffic ? 1 : 0}
                  style={{ cursor: "default" }}
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
        </div>
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
