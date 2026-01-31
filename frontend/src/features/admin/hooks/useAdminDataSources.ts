import { useCallback, useEffect, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import type { DataSource } from "../types";
import {
  createDataSource,
  deleteDataSource,
  fetchDataSources,
  setActiveDataSource,
  updateDataSource,
} from "../transport/dataSources";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type UseAdminDataSourcesParams = {
  credentials: Credentials;
  selectedClient: string;
  active: boolean;
  onAlert: (alert: AlertPayload | null) => void;
};

type UseAdminDataSourcesResult = {
  dataSources: DataSource[];
  reloadDataSources: () => void;
  addDataSource: (
    payload: Pick<DataSource, "title" | "url" | "type">,
  ) => Promise<boolean>;
  updateDataSource: (payload: DataSource) => Promise<boolean>;
  deleteDataSource: (sourceId: string) => Promise<void>;
  activateDataSource: (sourceId: string) => Promise<void>;
};

export const useAdminDataSources = ({
  credentials,
  selectedClient,
  active,
  onAlert,
}: UseAdminDataSourcesParams): UseAdminDataSourcesResult => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);

  const loadDataSources = useCallback(async () => {
    if (!selectedClient) {
      return;
    }
    try {
      const data = await fetchDataSources(credentials, selectedClient);
      setDataSources(data);
    } catch (err) {
      onAlert({ message: "Failed to load data sources", type: "error" });
    }
  }, [credentials, onAlert, selectedClient]);

  useEffect(() => {
    if (active && selectedClient) {
      loadDataSources();
    }
  }, [active, loadDataSources, selectedClient]);

  const reloadDataSources = useCallback(() => {
    loadDataSources();
  }, [loadDataSources]);

  const addDataSourceEntry = useCallback(
    async (payload: Pick<DataSource, "title" | "url" | "type">) => {
      try {
        const data = await createDataSource(credentials, selectedClient, payload);
        if (data.success) {
          onAlert({
            message: "Data source created successfully",
            type: "success",
          });
          reloadDataSources();
          return true;
        }
        onAlert({ message: "Failed to create data source", type: "error" });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to create data source", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadDataSources, selectedClient],
  );

  const updateDataSourceEntry = useCallback(
    async (payload: DataSource) => {
      try {
        const data = await updateDataSource(credentials, selectedClient, payload);
        if (data.success) {
          onAlert({
            message: "Data source updated successfully",
            type: "success",
          });
          reloadDataSources();
          return true;
        }
        onAlert({ message: "Failed to update data source", type: "error" });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to update data source", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadDataSources, selectedClient],
  );

  const removeDataSource = useCallback(
    async (sourceId: string) => {
      try {
        const data = await deleteDataSource(credentials, selectedClient, sourceId);
        if (data.success) {
          onAlert({
            message: "Data source deleted successfully",
            type: "success",
          });
          reloadDataSources();
        } else {
          onAlert({ message: "Failed to delete data source", type: "error" });
        }
      } catch (err) {
        onAlert({ message: "Failed to delete data source", type: "error" });
      }
    },
    [credentials, onAlert, reloadDataSources, selectedClient],
  );

  const activateDataSource = useCallback(
    async (sourceId: string) => {
      try {
        const data = await setActiveDataSource(credentials, selectedClient, sourceId);
        if (data.success) {
          onAlert({
            message: "Data source activated successfully",
            type: "success",
          });
          reloadDataSources();
        } else {
          onAlert({ message: "Failed to activate data source", type: "error" });
        }
      } catch (err) {
        onAlert({ message: "Failed to activate data source", type: "error" });
      }
    },
    [credentials, onAlert, reloadDataSources, selectedClient],
  );

  return {
    dataSources,
    reloadDataSources,
    addDataSource: addDataSourceEntry,
    updateDataSource: updateDataSourceEntry,
    deleteDataSource: removeDataSource,
    activateDataSource,
  };
};
