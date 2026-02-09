import type { DashboardManifest } from "../../dashboard/types";

export const fetchDemoDashboardManifest = async (
  dashboardId = "dashboard-default",
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
