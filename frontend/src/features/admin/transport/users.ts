import { API_BASE_URL } from "../../../config";
import type { Credentials } from "../../../types/credentials";
import type { AdminUser, AdminRole } from "../types";

type UsersResponse = {
  users?: AdminUser[];
};

type UserMutationResponse = {
  success?: boolean;
  error?: string;
};

type CreateViewTokenResponse = {
  token?: string;
};

type CreateUserPayload = {
  username: string;
  password: string;
  name: string;
  role: AdminRole;
  csv_url?: string;
};

type UpdateUserPayload = {
  password: string;
  name: string;
  role: AdminRole;
  csv_url?: string;
};

const buildAuthHeaders = (credentials: Credentials) => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
};

export const fetchAdminUsers = async (
  credentials: Credentials,
): Promise<AdminUser[]> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
    headers: buildAuthHeaders(credentials),
  });

  if (!response.ok) {
    throw new Error("Failed to load users");
  }

  const data = (await response.json()) as UsersResponse;
  return data.users || [];
};

export const createAdminUser = async (
  credentials: Credentials,
  payload: CreateUserPayload,
): Promise<UserMutationResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
    method: "POST",
    headers: buildAuthHeaders(credentials),
    body: JSON.stringify(payload),
  });

  return (await response.json()) as UserMutationResponse;
};

export const updateAdminUser = async (
  credentials: Credentials,
  username: string,
  payload: UpdateUserPayload,
): Promise<UserMutationResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/users/${username}`, {
    method: "PUT",
    headers: buildAuthHeaders(credentials),
    body: JSON.stringify(payload),
  });

  return (await response.json()) as UserMutationResponse;
};

export const deleteAdminUser = async (
  credentials: Credentials,
  username: string,
): Promise<UserMutationResponse> => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  const response = await fetch(`${API_BASE_URL}/api/admin/users/${username}`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${auth}` },
  });

  return (await response.json()) as UserMutationResponse;
};

export const createViewToken = async (
  credentials: Credentials,
  clientId: string,
): Promise<CreateViewTokenResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/create-view-token`, {
    method: "POST",
    headers: buildAuthHeaders(credentials),
    body: JSON.stringify({ client_id: clientId }),
  });

  return (await response.json()) as CreateViewTokenResponse;
};
