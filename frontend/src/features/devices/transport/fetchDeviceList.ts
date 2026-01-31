import { API_BASE_URL } from "../../../config";
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
  let apiUrl = `${API_BASE_URL}/api/device-list`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (viewToken) {
    apiUrl += `?view_token=${encodeURIComponent(viewToken)}`;
  } else {
    const auth = btoa(`${credentials.username}:${credentials.password}`);
    headers.Authorization = `Basic ${auth}`;
    if (isAdmin && clientId) {
      apiUrl += `?client_id=${encodeURIComponent(clientId)}`;
    }
  }

  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as DeviceListResponse;
  return {
    devices: result.devices || [],
    data_sources: result.data_sources || [],
  };
};
