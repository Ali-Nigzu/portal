import { API_BASE_URL } from "../../../config";
import type { Credentials } from "../../../types/credentials";
import type { DeviceUser } from "../types";

type DeviceUsersResponse =
  | Record<string, DeviceUser>
  | { users?: Record<string, DeviceUser> };

export const fetchDeviceUsers = async (
  credentials: Credentials,
): Promise<Record<string, DeviceUser>> => {
  if (!credentials.username || !credentials.password) {
    return {};
  }
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load users");
  }

  const data = (await response.json()) as DeviceUsersResponse;
  if ("users" in data && data.users) {
    return data.users;
  }
  return data as Record<string, DeviceUser>;
};
