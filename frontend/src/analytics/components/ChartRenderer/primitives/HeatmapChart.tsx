import { Fragment, useMemo } from "react";
import { formatCoverage, formatNumeric, shouldShowRawCount } from "../utils/format";
import type { ChartPrimitiveProps } from "./types";

interface HeatmapCell {
  value: number | null | undefined;
  coverage?: number | null;
  rawCount?: number | null;
}

export const HeatmapChart = ({
  series,
  height,
  className,
}: ChartPrimitiveProps) => {
  const heatmapSeries = series.find((s) => s.geometry === "heatmap") ?? series[0];

  const { columns, rows, grid } = useMemo(() => {
    const columnOrder: string[] = [];
    const rowOrder: string[] = [];
    const gridMap = new Map<string, Map<string, HeatmapCell>>();

    heatmapSeries.data.forEach((point) => {
      const column = String(point.x);
      const row = String(point.group ?? "");

      if (!columnOrder.includes(column)) {
        columnOrder.push(column);
      }
      if (!rowOrder.includes(row)) {
        rowOrder.push(row);
      }

      if (!gridMap.has(row)) {
        gridMap.set(row, new Map());
      }

      gridMap.get(row)!.set(column, {
        value: point.value ?? point.y,
        coverage: point.coverage ?? null,
        rawCount: (point as unknown as { rawCount?: number | null }).rawCount ?? null,
      });
    });

    return { columns: columnOrder, rows: rowOrder, grid: gridMap };
  }, [heatmapSeries]);

  return (
    <div className={`heatmap-chart ${className ?? ""}`} style={{ height }}>
      <div
        className="heatmap-grid"
        style={{ gridTemplateColumns: `120px repeat(${columns.length}, 1fr)` }}
      >
        <div className="heatmap-corner" />
        {columns.map((column) => (
          <div key={column} className="heatmap-header">
            {column}
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={row}>
            <div className="heatmap-row-label">{row}</div>
            {columns.map((column) => {
              const cell = grid.get(row)?.get(column);
              const value = cell?.value ?? null;
              const coverage = cell?.coverage ?? null;
              const rawCount = cell?.rawCount ?? null;
              const coverageInfo = formatCoverage(coverage);
              const showRaw = shouldShowRawCount(rawCount);
              const classes = [
                "heatmap-cell",
                coverageInfo.tone === "critical" ? "critical" : "",
                coverageInfo.tone === "low" ? "low" : "",
                !cell ? "missing" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const opacity =
                value === null || value === undefined
                  ? 0
                  : Math.min(1, Math.max(0, Number(value)));

              return (
                <div
                  key={`${row}-${column}`}
                  className={classes}
                  style={{ backgroundColor: `rgba(38, 133, 255, ${opacity})` }}
                >
                  <div className="heatmap-value">{formatNumeric(value)}</div>
                  {showRaw ? <div className="heatmap-meta">raw: {rawCount}</div> : null}
                  {coverageInfo.label !== "—" ? (
                    <div className="heatmap-meta">coverage: {coverageInfo.label}</div>
                  ) : null}
                  {!cell ? <div className="heatmap-meta">missing</div> : null}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
};
