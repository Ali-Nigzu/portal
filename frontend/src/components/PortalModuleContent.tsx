import type { ReactNode } from "react";
import { usePortal } from "../context/PortalContext";
import { PortalDashboardProvider } from "../features/organisation-dashboard/OrganisationDashboardProvider";
import OrganisationDashboardPage from "../features/organisation-dashboard/OrganisationDashboardPage";
import EventLogsPage from "../features/events/EventLogsPage";
import AlarmLogsPage from "../features/alarms/AlarmLogsPage";
import DeviceListPage from "../features/devices/DeviceListPage";
import PortalReports from "../features/reports/PortalReports";
import DashboardLoadingState from "../features/organisation-dashboard/DashboardLoadingState";
import { isPortalModule, type PortalModule } from "../features/organisation-dashboard/authenticatedPortalRoutes";

export default function PortalModuleContent({ module, scopeHeader }: { module: string; scopeHeader?: ReactNode }) {
  const { context, selection, key, error, retry } = usePortal();
  if (error) return <div role="alert">{error} <button onClick={retry}>Retry</button></div>;
  if (!context) return <DashboardLoadingState label="Loading organisation…" />;
  if (!selection || !isPortalModule(module)) return <div role="alert">Portal page not found.</div>;
  const pages: Record<PortalModule, ReactNode> = {
    dashboard: <PortalDashboardProvider><OrganisationDashboardPage hideHeader={!!scopeHeader} /></PortalDashboardProvider>,
    "event-logs": <EventLogsPage />,
    "alarm-logs": <AlarmLogsPage />,
    "device-list": <DeviceListPage />,
    reports: <PortalReports />,
  };
  return <div key={key}>{scopeHeader}{pages[module]}</div>;
}
