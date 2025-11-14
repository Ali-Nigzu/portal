import { API_BASE_URL } from "../../../config";
import type { DashboardManifest, DashboardWidget } from "../types";

export interface PinWidgetRequest {
  widget: DashboardWidget;
  position?: "start" | "end";
  targetBand?: "kpiBand" | "grid";
}

export async function pinDashboardWidget(
  orgId: string,
  dashboardId: string,
  payload: PinWidgetRequest,
): Promise<DashboardManifest> {
  const response = await fetch(
    `${API_BASE_URL}/api/dashboards/${dashboardId}/widgets?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to pin widget: ${response.status} ${text}`);
  }

  return (await response.json()) as DashboardManifest;
}

export async function unpinDashboardWidget(
  orgId: string,
  dashboardId: string,
  widgetId: string,
): Promise<DashboardManifest> {
  const response = await fetch(
    `${API_BASE_URL}/api/dashboards/${dashboardId}/widgets/${encodeURIComponent(widgetId)}?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to remove widget: ${response.status} ${text}`);
  }

  return (await response.json()) as DashboardManifest;
}
