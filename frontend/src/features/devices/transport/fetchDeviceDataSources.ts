import { API_BASE_URL } from "../../../config";
import type { Credentials } from "../../../types/credentials";
import type { DataSource } from "../types";

type DataSourcesResponse = {
  data_sources?: DataSource[];
};

export const fetchDeviceDataSources = async (
  credentials: Credentials,
  clientId: string,
): Promise<DataSource[]> => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  const response = await fetch(
    `${API_BASE_URL}/api/admin/data-sources/${clientId}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to load data sources");
  }

  const data = (await response.json()) as DataSourcesResponse;
  return data.data_sources || [];
};
