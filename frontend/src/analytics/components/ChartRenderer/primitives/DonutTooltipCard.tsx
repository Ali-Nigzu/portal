import React from "react";

export type DonutTooltipRow = {
  id: string;
  label: string;
  valueText: string;
  color: string;
  isActive: boolean;
  interactive?: boolean;
};

export const DonutTooltipCard = ({
  header,
  rows,
}: {
  header?: string;
  rows: DonutTooltipRow[];
}) => {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="analytics-chart-tooltip analytics-chart-tooltip--donut" role="status" aria-live="polite">
      {header ? <div className="tooltip-header">{header}</div> : null}
      <ul>
        {rows.map((row) => (
          <li
            key={row.id}
            className="tooltip-row"
            style={{
              opacity: row.interactive === false ? 0.7 : 1,
              fontWeight: row.isActive ? 700 : 500,
            }}
          >
            <span className="series-label" style={{ color: row.color }}>
              <span className="swatch" style={{ backgroundColor: row.color }} />
              {row.label}
            </span>
            <span className="series-value" style={{ color: row.color }}>
              {row.valueText}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
