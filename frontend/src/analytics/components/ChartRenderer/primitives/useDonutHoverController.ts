import { useMemo, useState } from "react";

type PointerPosition = { x: number; y: number };

type InteractionEvent = {
  chartX?: unknown;
  chartY?: unknown;
  clientX?: unknown;
  clientY?: unknown;
  pageX?: unknown;
  pageY?: unknown;
  nativeEvent?: {
    chartX?: unknown;
    chartY?: unknown;
    clientX?: unknown;
    clientY?: unknown;
    pageX?: unknown;
    pageY?: unknown;
  };
};

type HoverBounds = {
  width: number;
  height: number;
};

const asFinite = (value: unknown): number | null => {
  if (typeof value !== "number") {
    return null;
  }
  return Number.isFinite(value) ? value : null;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const useDonutHoverController = () => {
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<PointerPosition | null>(null);

  const clearHover = () => {
    setHoveredSegmentId(null);
    setPointer(null);
  };

  const updateHover = (
    segmentId: string | null,
    event: InteractionEvent | null | undefined,
    containerRect?: DOMRect | null,
  ) => {
    if (!segmentId) {
      clearHover();
      return;
    }

    const nativeEvent = event?.nativeEvent;
    const directChartX = asFinite(event?.chartX);
    const directChartY = asFinite(event?.chartY);
    const nativeChartX = asFinite(nativeEvent?.chartX);
    const nativeChartY = asFinite(nativeEvent?.chartY);

    let nextX = directChartX ?? nativeChartX;
    let nextY = directChartY ?? nativeChartY;

    if ((nextX === null || nextY === null) && containerRect) {
      const clientX = asFinite(event?.clientX) ?? asFinite(nativeEvent?.clientX);
      const clientY = asFinite(event?.clientY) ?? asFinite(nativeEvent?.clientY);
      if (clientX !== null && clientY !== null) {
        nextX = clientX - containerRect.left;
        nextY = clientY - containerRect.top;
      }
    }

    if (nextX === null || nextY === null) {
      clearHover();
      return;
    }

    setHoveredSegmentId(segmentId);
    setPointer({ x: nextX, y: nextY });
  };

  const getTooltipPosition = (
    bounds: HoverBounds,
    tooltipSize: { width: number; height: number },
    offset: { x: number; y: number } = { x: 12, y: 12 },
    edgePadding = 4,
  ) => {
    if (!pointer) {
      return null;
    }
    const maxX = Math.max(edgePadding, bounds.width - tooltipSize.width - edgePadding);
    const maxY = Math.max(edgePadding, bounds.height - tooltipSize.height - edgePadding);
    return {
      x: clamp(pointer.x + offset.x, edgePadding, maxX),
      y: clamp(pointer.y + offset.y, edgePadding, maxY),
    };
  };

  const isActive = useMemo(
    () => hoveredSegmentId !== null && pointer !== null,
    [hoveredSegmentId, pointer],
  );

  return {
    hoveredSegmentId,
    pointer,
    isActive,
    updateHover,
    clearHover,
    getTooltipPosition,
  };
};
