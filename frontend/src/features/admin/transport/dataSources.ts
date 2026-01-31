import { API_BASE_URL } from "../../../config";
import type { Credentials } from "../../../types/credentials";
import type { DataSource } from "../types";

type DataSourcesResponse = {
  data_sources?: DataSource[];
};

type DataSourceMutationResponse = {
  success?: boolean;
};

const buildAuthHeaders = (credentials: Credentials) => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
};

export const fetchDataSources = async (
  credentials: Credentials,
  clientId: string,
): Promise<DataSource[]> => {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/data-sources/${clientId}`,
    {
      headers: buildAuthHeaders(credentials),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to load data sources");
  }

  const data = (await response.json()) as DataSourcesResponse;
  return data.data_sources || [];
};

export const createDataSource = async (
  credentials: Credentials,
  clientId: string,
  payload: Pick<DataSource, "title" | "url" | "type">,
): Promise<DataSourceMutationResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/data-sources/${clientId}`,
    {
      method: "POST",
      headers: buildAuthHeaders(credentials),
      body: JSON.stringify(payload),
    },
  );

  return (await response.json()) as DataSourceMutationResponse;
};

export const updateDataSource = async (
  credentials: Credentials,
  clientId: string,
  payload: DataSource,
): Promise<DataSourceMutationResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/data-sources/${clientId}/${payload.id}`,
    {
      method: "PUT",
      headers: buildAuthHeaders(credentials),
      body: JSON.stringify({
        title: payload.title,
        url: payload.url,
        type: payload.type,
      }),
    },
  );

  return (await response.json()) as DataSourceMutationResponse;
};

export const deleteDataSource = async (
  credentials: Credentials,
  clientId: string,
  sourceId: string,
): Promise<DataSourceMutationResponse> => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  const response = await fetch(
    `${API_BASE_URL}/api/admin/data-sources/${clientId}/${sourceId}`,
    { method: "DELETE", headers: { Authorization: `Basic ${auth}` } },
  );

  return (await response.json()) as DataSourceMutationResponse;
};

export const setActiveDataSource = async (
  credentials: Credentials,
  clientId: string,
  sourceId: string,
): Promise<DataSourceMutationResponse> => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  const response = await fetch(
    `${API_BASE_URL}/api/admin/data-sources/${clientId}/${sourceId}/set-active`,
    { method: "POST", headers: { Authorization: `Basic ${auth}` } },
  );

  return (await response.json()) as DataSourceMutationResponse;
};
