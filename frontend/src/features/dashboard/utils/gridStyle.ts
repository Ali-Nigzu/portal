import type { DashboardGridPlacement } from "../types";

export const GRID_ROW_HEIGHT = 96;

export const buildGridStyle = (placement?: DashboardGridPlacement) => {
  if (!placement) {
    return undefined;
  }
  return {
    gridColumn: `${placement.x + 1} / span ${Math.max(1, placement.w)}`,
    gridRow: `${placement.y + 1} / span ${Math.max(1, placement.h)}`,
    minHeight: `${Math.max(1, placement.h) * GRID_ROW_HEIGHT}px`,
  };
};
