import { API_BASE_URL } from "../../../config";
import { isDemoSessionActive } from "../../../lib/demoSession";
import type { Credentials } from "../../../types/credentials";
import type { DataSource, DeviceInfo } from "../types";

type FetchDeviceListParams = {
  credentials: Credentials;
  viewToken: string | null;
  clientId?: string;
  isAdmin: boolean;
};

type DeviceListResponse = {
  devices?: DeviceInfo[];
  data_sources?: DataSource[];
};

export const fetchDeviceList = async ({
  credentials,
  viewToken,
  clientId,
  isAdmin,
}: FetchDeviceListParams): Promise<DeviceListResponse> => {
  const isDemoSession = isDemoSessionActive();
  let apiUrl = `${API_BASE_URL}/api/device-list`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (viewToken) {
    apiUrl += `?view_token=${encodeURIComponent(viewToken)}`;
  } else if (!isDemoSession) {
    if (!credentials.username || !credentials.password) {
      return { devices: [], data_sources: [] };
    }
    const auth = btoa(`${credentials.username}:${credentials.password}`);
    headers.Authorization = `Basic ${auth}`;
    if (isAdmin && clientId) {
      apiUrl += `?client_id=${encodeURIComponent(clientId)}`;
    }
  }

  const response = await fetch(apiUrl, {
    headers,
    credentials: isDemoSession ? "include" : "same-origin",
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as DeviceListResponse;
  return {
    devices: result.devices || [],
    data_sources: result.data_sources || [],
  };
};
