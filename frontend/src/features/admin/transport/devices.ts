import { API_BASE_URL } from "../../../config";
import type { Credentials } from "../../../types/credentials";
import type { DeviceInfo, NewDevicePayload } from "../types";

type DeviceListResponse = {
  devices?: DeviceInfo[];
};

type DeviceMutationResponse = {
  success?: boolean;
};

const buildAuthHeaders = (credentials: Credentials) => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
};

export const fetchDeviceList = async (
  credentials: Credentials,
  clientId: string,
): Promise<DeviceInfo[]> => {
  const response = await fetch(
    `${API_BASE_URL}/api/device-list?client_id=${clientId}`,
    {
      headers: buildAuthHeaders(credentials),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to load devices");
  }

  const data = (await response.json()) as DeviceListResponse;
  return data.devices || [];
};

export const createDevice = async (
  credentials: Credentials,
  payload: NewDevicePayload,
): Promise<DeviceMutationResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/device-list`, {
    method: "POST",
    headers: buildAuthHeaders(credentials),
    body: JSON.stringify(payload),
  });

  return (await response.json()) as DeviceMutationResponse;
};

export const updateDevice = async (
  credentials: Credentials,
  payload: DeviceInfo,
): Promise<DeviceMutationResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/device-list/${payload.id}`,
    {
      method: "PUT",
      headers: buildAuthHeaders(credentials),
      body: JSON.stringify(payload),
    },
  );

  return (await response.json()) as DeviceMutationResponse;
};

export const deleteDevice = async (
  credentials: Credentials,
  deviceId: string,
): Promise<DeviceMutationResponse> => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  const response = await fetch(
    `${API_BASE_URL}/api/admin/device-list/${deviceId}`,
    { method: "DELETE", headers: { Authorization: `Basic ${auth}` } },
  );

  return (await response.json()) as DeviceMutationResponse;
};
