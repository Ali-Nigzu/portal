import "../dashboard/styles/DashboardPage.css";

export default function DashboardLoadingState({ label = "Loading dashboard…" }: { label?: string }) {
  return <div className="dashboard-loading" role="status">
    <span className="dashboard-loading__spinner" aria-hidden="true" />
    <span className="dashboard-loading__label">{label}</span>
  </div>;
}
