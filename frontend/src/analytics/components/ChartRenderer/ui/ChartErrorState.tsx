import type { ValidationIssue } from "../validation";

interface ChartErrorStateProps {
  issues: ValidationIssue[];
  height: number;
  className?: string;
}

export const ChartErrorState = ({ issues, height, className }: ChartErrorStateProps) => {
  return (
    <div className={`analytics-chart-error ${className ?? ""}`} style={{ minHeight: height }}>
      <div className="analytics-chart-error__icon" aria-hidden="true">
        ⚠️
      </div>
      <div className="analytics-chart-error__content">
        <h4>Unable to render chart</h4>
        <p>Backend chart payload violated the Phase 2 contract:</p>
        <ul>
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};
