interface ChartEmptyStateProps {
  height: number;
  className?: string;
  message?: string;
}

export const ChartEmptyState = ({
  height,
  className,
  message = "No data available for the selected range",
}: ChartEmptyStateProps) => {
  return (
    <div className={`analytics-chart-empty ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="analytics-chart-empty__icon" aria-hidden="true">
        📊
      </div>
      <div className="analytics-chart-empty__content">
        <h4>Nothing to display yet</h4>
        <p>{message}</p>
      </div>
    </div>
  );
};
