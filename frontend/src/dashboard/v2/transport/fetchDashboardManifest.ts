import { API_BASE_URL } from "../../../config";
import type { DashboardManifest } from "../types";

export async function fetchDashboardManifest(
  orgId: string,
  dashboardId = "dashboard-default",
): Promise<DashboardManifest> {
  const response = await fetch(
    `${API_BASE_URL}/api/dashboards/${dashboardId}?orgId=${encodeURIComponent(orgId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to load dashboard manifest: ${response.status} ${text}`);
  }

  return (await response.json()) as DashboardManifest;
}
