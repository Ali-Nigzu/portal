import { API_BASE_URL } from "../../../config";
import { determineOrgId } from "../../../lib/org";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import type { Credentials } from "../../../types/credentials";
import type { SnapshotResponse } from "../../../lib/snapshots";

export const fetchLatestSnapshot = async (
  credentials?: Credentials,
): Promise<SnapshotResponse> => {
  const urlParams = new URLSearchParams(window.location.search);
  const viewToken = getViewTokenFromLocation();
  const clientId = urlParams.get("client_id");
  const resolvedClientId =
    clientId ?? (credentials ? determineOrgId(credentials) : null);
  const params = new URLSearchParams();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (viewToken) {
    params.append("viewToken", viewToken);
  } else if (resolvedClientId) {
    params.append("org", resolvedClientId);
  } else {
    throw new Error("Missing view_token or client_id for snapshot lookup.");
  }
  if (!viewToken && credentials) {
    const auth = btoa(`${credentials.username}:${credentials.password}`);
    headers["Authorization"] = `Basic ${auth}`;
  }
  const response = await fetch(
    `${API_BASE_URL}/api/snapshots/latest?${params.toString()}`,
    { headers },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Snapshot fetch failed: ${response.status} ${text}`);
  }
  return (await response.json()) as SnapshotResponse;
};
