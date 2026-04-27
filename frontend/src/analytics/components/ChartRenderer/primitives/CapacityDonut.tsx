import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { ChartPrimitiveProps } from "./types";
import { useDonutHoverController } from "./useDonutHoverController";
import { DonutTooltipCard, type DonutTooltipRow } from "./DonutTooltipCard";
import { useDemoDonutTooltipOwner } from "./DemoDonutTooltipOwnerContext";

const capacityColors = [
  "#2d6cdf",
  "#f97066",
  "var(--vrm-bg-panel, var(--surface-panel, #e8edf2))",
];

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
    value: (entry.value / renderTotal) * 100,
    displayValue: entry.label === "Peak extra"
      ? peakTotalValue
      : entry.label === "Usage"
        ? usageValue
        : entry.value,
  }));
  const centerDisplay = `${Math.round(centerValue)}%`;
  const donutInnerRadius = 48;
  const donutOuterRadius = 68;
  const donutChartHeight = 140;
  const [legacyHoverLabel, setLegacyHoverLabel] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const hoverController = useDonutHoverController({
    enabled: isDemoCursorHover,
    geometry: {
      innerRadius: donutInnerRadius,
      outerRadius: donutOuterRadius,
      startAngle: 90,
      endAngle: 450,
    },
    segments: normalizedData.map((entry) => ({
      id: entry.label,
      value: entry.value,
      interactive: entry.label !== "Remaining",
    })),
  });
  const hoveredSlice = normalizedData.find(
    (entry) => entry.label === hoverController.activeSegmentId,
  );
  const tooltipRows = useMemo<DonutTooltipRow[]>(() => {
    if (!isDemoCursorHover) {
      return [];
    }
    return normalizedData
      .filter((entry) => entry.label !== "Remaining")
      .map((entry) => {
        const value =
          typeof entry.displayValue === "number" ? entry.displayValue : entry.value;
        return {
          id: entry.label,
          label: entry.label === "Usage" ? "Current" : "Peak",
          valueText: `${Math.max(0, Math.round(value))}%`,
          color: entry.color,
          isActive: hoverController.activeSegmentId === entry.label,
          interactive: true,
        };
      })
      .filter((entry) => entry.valueText !== "0%");
  }, [hoverController.activeSegmentId, isDemoCursorHover, normalizedData]);
  const hoverLabelText = useMemo(() => {
    if (isDemoCursorHover) {
      if (!hoverController.isTooltipVisible || !hoveredSlice || hoveredSlice.label === "Remaining") {
        return "";
      }
      const value =
        typeof hoveredSlice.displayValue === "number"
          ? hoveredSlice.displayValue
          : hoveredSlice.value;
      const rounded = Math.max(0, Math.round(value));
      return hoveredSlice.label === "Peak extra" ? `Peak ${rounded}%` : `Current ${rounded}%`;
    }
    if (!legacyHoverLabel) {
      return "";
    }
    return legacyHoverLabel.text;
  }, [hoverController.isTooltipVisible, hoveredSlice, isDemoCursorHover, legacyHoverLabel]);
  const getHoverBounds = useCallback(() => {
    const surface = chartSurfaceRef.current;
    if (!surface) {
      return null;
    }
    return {
      element: surface,
      bounds: {
        width: surface.clientWidth,
        height: surface.clientHeight || donutChartHeight,
      },
    };
  }, [donutChartHeight]);
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

  const invalidateHoverAndRelease = useCallback(() => {
    hoverController.clearHover();
    if (donutTooltipOwner && donutTooltipOwnerId) {
      donutTooltipOwner.release(donutTooltipOwnerId);
    }
  }, [donutTooltipOwner, donutTooltipOwnerId, hoverController]);

  useEffect(() => {
    if (
      !isDemoCursorHover ||
      !donutTooltipOwner ||
      !donutTooltipOwnerId ||
      donutTooltipOwner.activeOwnerId !== donutTooltipOwnerId
    ) {
      return;
    }

    const validateViewportPoint = (clientX: number, clientY: number) => {
      const hoverBounds = getHoverBounds();
      if (!hoverBounds) {
        invalidateHoverAndRelease();
        return;
      }
      const resolution = hoverController.syncFromViewportPoint(
        clientX,
        clientY,
        hoverBounds.element,
        hoverBounds.bounds,
      );
      if (!resolution.pointer || !resolution.segmentId) {
        invalidateHoverAndRelease();
      }
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      validateViewportPoint(event.clientX, event.clientY);
    };
    const handleWindowPointerUp = (event: PointerEvent) => {
      validateViewportPoint(event.clientX, event.clientY);
    };
    const handleWindowPointerCancel = () => {
      invalidateHoverAndRelease();
    };
    const handleWindowMouseLeave = () => {
      invalidateHoverAndRelease();
    };
    const handleWindowBlur = () => {
      invalidateHoverAndRelease();
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    window.addEventListener("mouseleave", handleWindowMouseLeave);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
      window.removeEventListener("mouseleave", handleWindowMouseLeave);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    donutTooltipOwner,
    donutTooltipOwnerId,
    getHoverBounds,
    hoverController,
    invalidateHoverAndRelease,
    isDemoCursorHover,
  ]);

  useEffect(() => {
    return () => {
      invalidateHoverAndRelease();
    };
  }, [invalidateHoverAndRelease]);
  const tooltipPosition = useMemo(() => {
    const container = chartSurfaceRef.current;
    const tooltipRect = hoverLabelRef.current?.getBoundingClientRect();
    if (!container) {
      return null;
    }
    if (isDemoCursorHover) {
      return hoverController.getTooltipPosition(
        { width: container.clientWidth, height: container.clientHeight },
        { width: tooltipRect?.width ?? 102, height: tooltipRect?.height ?? 20 },
        { x: 12, y: 12 },
        4,
        {
          centerX: container.clientWidth / 2,
          centerY: container.clientHeight / 2,
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
    const hovered = normalizedData[entryIndex];
    if (!hovered || hovered.label === "Remaining") {
      setLegacyHoverLabel(null);
      return;
    }
    const value = typeof hovered.displayValue === "number" ? hovered.displayValue : hovered.value;
    const rounded = Math.max(0, Math.round(value));
    const text = hovered.label === "Peak extra" ? `Peak ${rounded}%` : `Current ${rounded}%`;
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
    const labelWidth = labelRect?.width ?? 96;
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
      const push = minRadius - safeDistance;
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
      className={`capacity-usage kpi-tile ${className ?? ""}`}
      style={{ minHeight: height }}
    >
      <div className="capacity-usage__title">{title}</div>
      <div
        className="capacity-usage__content"
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
          onPointerLeave={isDemoCursorHover ? invalidateHoverAndRelease : undefined}
          onMouseLeave={isDemoCursorHover ? invalidateHoverAndRelease : undefined}
          onPointerCancel={isDemoCursorHover ? invalidateHoverAndRelease : undefined}
          onBlur={isDemoCursorHover ? invalidateHoverAndRelease : undefined}
          onClick={isDemoCursorHover ? invalidateHoverAndRelease : undefined}
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
              data={normalizedData}
              cx="50%"
              cy="50%"
              innerRadius={donutInnerRadius}
              outerRadius={donutOuterRadius}
              paddingAngle={0}
              startAngle={90}
              endAngle={450}
              stroke="none"
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
              {normalizedData.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={entry.color}
                  stroke="none"
                  style={
                    entry.label === "Remaining"
                      ? { pointerEvents: "none", cursor: "default" }
                      : { cursor: "default" }
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
    </div>
  );
};
