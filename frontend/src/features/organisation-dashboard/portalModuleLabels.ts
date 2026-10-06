import type { PortalModule } from "./authenticatedPortalRoutes";

export const PORTAL_MODULE_LABELS = {
  dashboard: "Dashboard",
  "event-logs": "Event Logs",
  "alarm-logs": "Alarm Logs",
  "device-list": "Device List",
  reports: "Reports",
} satisfies Record<PortalModule, string>;
