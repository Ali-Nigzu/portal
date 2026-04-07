import { useMemo, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { ChartPrimitiveProps } from "./types";

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
}: ChartPrimitiveProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);
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
  const [hoverLabel, setHoverLabel] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const hoverLabelText = useMemo(() => {
    if (!hoverLabel) {
      return "";
    }
    return hoverLabel.text;
  }, [hoverLabel]);
  const placeHoverLabel = (
    entryIndex: number,
    shape: { cx?: unknown; cy?: unknown; outerRadius?: unknown; midAngle?: unknown },
  ) => {
    const hovered = normalizedData[entryIndex];
    if (!hovered || hovered.label === "Remaining") {
      setHoverLabel(null);
      return;
    }
    const value = typeof hovered.displayValue === "number" ? hovered.displayValue : hovered.value;
    const rounded = Math.max(0, Math.round(value));
    const text = hovered.label === "Peak extra" ? `Peak ${rounded}%` : `Current ${rounded}%`;
    const container = containerRef.current;
    if (!container) {
      setHoverLabel({ text, x: 0, y: 0 });
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
    setHoverLabel({ text, x: nextX, y: nextY });
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
        {hoverLabelText ? (
          <div
            ref={hoverLabelRef}
            aria-live="polite"
            style={{
              position: "absolute",
              left: `${hoverLabel?.x ?? 0}px`,
              top: `${hoverLabel?.y ?? 0}px`,
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
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              dataKey="value"
              data={normalizedData}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={68}
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
                setHoverLabel(null);
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
  );
};
