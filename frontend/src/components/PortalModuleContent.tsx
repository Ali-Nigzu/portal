import { type ReactNode, lazy, Suspense } from "react";
import { type PortalModule, isPortalModule } from "../features/organisation-dashboard/authenticatedPortalRoutes";

import { usePortal } from "../context/PortalContext";

import "../styles/Dashboard.css";
const OrganisationDashboardPage = lazy(
  () => import("../features/organisation-dashboard/OrganisationDashboardPage"),
);
const EventLogsPage = lazy(() => import("../features/events/EventLogsPage"));
const AlarmLogsPage = lazy(() => import("../features/alarms/AlarmLogsPage"));
const DeviceListPage = lazy(() => import("../features/devices/DeviceListPage"));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage"));

export default function PortalModuleContent({
  module,
  scopeHeader,
}: {
  module: string;
  scopeHeader?: ReactNode;
}) {
  const { context, selection, key, error, retry } = usePortal();
  if (error)
    return (
      <div role="alert">
        {error} <button onClick={retry}>Retry</button>
      </div>
    );
  if (!context) return <DashboardLoadingState label="Loading organisation…" />;
  if (!selection || !isPortalModule(module))
    return <div role="alert">Portal page not found.</div>;
  const pages: Record<PortalModule, ReactNode> = {
    dashboard: <OrganisationDashboardPage hideHeader={!!scopeHeader} />,
    "event-logs": <EventLogsPage />,
    "alarm-logs": <AlarmLogsPage />,
    "device-list": <DeviceListPage />,
    reports: <ReportsPage />,
  };
  return (
    <div key={key}>
      {scopeHeader}
      <Suspense fallback={<DashboardLoadingState />}>{pages[module]}</Suspense>
    </div>
  );
}

function DashboardLoadingState({
  label = "Loading dashboard…",
}: {
  label?: string;
}) {
  return (
    <div className="dashboard-loading" role="status">
      <span className="dashboard-loading__spinner" aria-hidden="true" />
      <span className="dashboard-loading__label">{label}</span>
    </div>
  );
}

export { DashboardLoadingState };
