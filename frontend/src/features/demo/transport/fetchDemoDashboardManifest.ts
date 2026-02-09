import type { DashboardManifest } from "../../dashboard/types";
import type { FetchDashboardManifestOptions } from "../../dashboard/transport/fetchDashboardManifest";

export const fetchDemoDashboardManifest = async (
  _orgId?: string,
  dashboardId = "dashboard-default",
  _options?: FetchDashboardManifestOptions,
): Promise<DashboardManifest> => {
  const response = await fetch(`/api/demo/dashboards/${dashboardId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to load demo dashboard manifest (${response.status}): ${text}`,
    );
  }
  return (await response.json()) as DashboardManifest;
};
