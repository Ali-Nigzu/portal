import type { ReactNode } from "react";
import { usePortal } from "../context/PortalContext";
import VRMLayout from "./VRMLayout";
import { PortalDashboardProvider } from "../features/organisation-dashboard/OrganisationDashboardProvider";
import OrganisationDashboardPage from "../features/organisation-dashboard/OrganisationDashboardPage";
import EventLogsPage from "../features/events/EventLogsPage";
import AlarmLogsPage from "../features/alarms/AlarmLogsPage";
import DeviceListPage from "../features/devices/DeviceListPage";
import PortalReports from "../features/reports/PortalReports";

const modules = [
  "dashboard",
  "event-logs",
  "alarm-logs",
  "device-list",
  "reports",
];
// Identity and transport are supplied by the parent; this application has no Demo defaults.
export default function PortalApplication({ module }: { module: string }) {
  const { context, selection, key } = usePortal();
  if (!context) return null;
  if (!selection || !modules.includes(module))
    return (
      <div role="alert">
        {module === "dashboard"
          ? "Dashboard not found."
          : "Portal page not found."}
      </div>
    );
  const organisation = {
    id: encodeURIComponent(context.organisation.slug),
    label: context.organisation.name,
  };
  const sites = context.sites.map((s) => ({
    id: `${organisation.id}/${encodeURIComponent(s.slug)}`,
    label: s.name,
  }));
  const site =
    selection.scope === "site"
      ? context.sites.find((s) => s.id === selection.id)
      : undefined;
  const selectedKey = site
    ? `${organisation.id}/${encodeURIComponent(site.slug)}`
    : organisation.id;
  const pages: Record<string, ReactNode> = {
    dashboard: (
      <PortalDashboardProvider>
        <OrganisationDashboardPage />
      </PortalDashboardProvider>
    ),
    "event-logs": <EventLogsPage />,
    "alarm-logs": <AlarmLogsPage />,
    "device-list": <DeviceListPage />,
    reports: <PortalReports />,
  };
  return (
    <VRMLayout
      dashboardNavigation={{
        organisation,
        sites,
        selectedKey,
        selectedLabel: site?.name ?? organisation.label,
      }}
    >
      <div key={key}>{pages[module]}</div>
    </VRMLayout>
  );
}
