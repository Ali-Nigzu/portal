import { useMemo, useState } from "react";
import type { PointerEvent } from "react";

type PointerPosition = { x: number; y: number };

type SegmentDescriptor = {
  id: string;
  value: number;
  interactive?: boolean;
};

type RingGeometry = {
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
};

type ControllerOptions = {
  enabled: boolean;
  geometry: RingGeometry;
  segments: SegmentDescriptor[];
};

type HoverBounds = {
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const normalizeAngle = (angle: number): number => {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const unwrapClockwise = (angle: number, startAngle: number): number => {
  let next = angle;
  while (next < startAngle) {
    next += 360;
  }
  while (next >= startAngle + 360) {
    next -= 360;
  }
  return next;
};

const unwrapCounterClockwise = (angle: number, startAngle: number): number => {
  let next = angle;
  while (next > startAngle) {
    next -= 360;
  }
  while (next <= startAngle - 360) {
    next += 360;
  }
  return next;
};

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

const resolveSegmentAtPointer = (
  pointer: PointerPosition,
  bounds: HoverBounds,
  geometry: RingGeometry,
  segments: SegmentDescriptor[],
): string | null => {
  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;
  const dx = pointer.x - centerX;
  const dy = pointer.y - centerY;
  const radius = Math.hypot(dx, dy);

  if (radius < geometry.innerRadius || radius > geometry.outerRadius) {
    return null;
  }

  const clockwise = geometry.endAngle >= geometry.startAngle;
  const absoluteSpan = Math.abs(geometry.endAngle - geometry.startAngle);
  if (!isFinitePositive(absoluteSpan)) {
    return null;
  }

  const rawAngle = normalizeAngle((-Math.atan2(dy, dx) * 180) / Math.PI);
  const resolvedAngle = clockwise
    ? unwrapClockwise(rawAngle, geometry.startAngle)
    : unwrapCounterClockwise(rawAngle, geometry.startAngle);

  const total = segments.reduce((sum, segment) => {
    return sum + (isFinitePositive(segment.value) ? segment.value : 0);
  }, 0);
  if (!isFinitePositive(total)) {
    return null;
  }

  let cursor = geometry.startAngle;
  let lastInteractiveHit: string | null = null;

  for (const segment of segments) {
    const safeValue = isFinitePositive(segment.value) ? segment.value : 0;
    if (safeValue <= 0) {
      continue;
    }
    const delta = (safeValue / total) * absoluteSpan;
    const next = clockwise ? cursor + delta : cursor - delta;

    const contains = clockwise
      ? resolvedAngle >= cursor && resolvedAngle < next
      : resolvedAngle <= cursor && resolvedAngle > next;

    if (contains) {
      if (segment.interactive === false) {
        return null;
      }
      return segment.id;
    }

    if (segment.interactive !== false) {
      lastInteractiveHit = segment.id;
    }

    cursor = next;
  }

  const atEnd = clockwise
    ? Math.abs(resolvedAngle - (geometry.startAngle + absoluteSpan)) < 0.0001
    : Math.abs(resolvedAngle - (geometry.startAngle - absoluteSpan)) < 0.0001;

  return atEnd ? lastInteractiveHit : null;
};

export const useDonutHoverController = ({
  enabled,
  geometry,
  segments,
}: ControllerOptions) => {
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<PointerPosition | null>(null);

  const clearHover = () => {
    setActiveSegmentId(null);
    setPointer(null);
  };

  const updateFromPointerEvent = (
    event: PointerEvent<HTMLElement>,
    bounds: HoverBounds,
  ) => {
    if (!enabled) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const nextPointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    const boundedPointer = {
      x: clamp(nextPointer.x, 0, bounds.width),
      y: clamp(nextPointer.y, 0, bounds.height),
    };

    setPointer(boundedPointer);

    const hitSegmentId = resolveSegmentAtPointer(
      boundedPointer,
      bounds,
      geometry,
      segments,
    );
    setActiveSegmentId(hitSegmentId);
  };

  const isTooltipVisible = useMemo(
    () => enabled && activeSegmentId !== null && pointer !== null,
    [activeSegmentId, enabled, pointer],
  );

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

  return {
    activeSegmentId,
    pointer,
    isTooltipVisible,
    updateFromPointerEvent,
    clearHover,
    getTooltipPosition,
  };
};
