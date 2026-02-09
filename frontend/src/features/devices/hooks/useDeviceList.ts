import { useCallback, useEffect, useMemo, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import type { DataSource, DeviceInfo, DeviceUser } from "../types";
import { fetchDeviceList } from "../transport/fetchDeviceList";
import { fetchDeviceUsers } from "../transport/fetchDeviceUsers";
import { fetchDeviceDataSources } from "../transport/fetchDeviceDataSources";
import { fetchDataSourceCsv } from "../transport/fetchDataSourceCsv";

type DeviceUsersMap = Record<string, DeviceUser>;

type DeviceListState = {
  devices: DeviceInfo[];
  dataSources: DataSource[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  selectedClient: string;
  setSelectedClient: (value: string) => void;
  clientUsers: Array<[string, DeviceUser]>;
  refreshDevices: () => void;
  downloadDataSource: (sourceUrl: string, sourceName: string) => void;
};

type DeviceListOverrides = {
  isDemo?: boolean;
  fetchDeviceListFn?: typeof fetchDeviceList;
  fetchDeviceUsersFn?: typeof fetchDeviceUsers;
  fetchDeviceDataSourcesFn?: typeof fetchDeviceDataSources;
  viewToken?: string | null;
};

export const useDeviceList = (
  credentials: Credentials,
  overrides: DeviceListOverrides = {},
): DeviceListState => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<DeviceUsersMap>({});
  const [selectedClient, setSelectedClient] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);

  const viewToken =
    overrides.viewToken !== undefined
      ? overrides.viewToken
      : getViewTokenFromLocation();
  const isDemo = Boolean(overrides.isDemo);

  const loadUsers = useCallback(async () => {
    try {
      const fetchUsers = overrides.fetchDeviceUsersFn ?? fetchDeviceUsers;
      const usersData = await fetchUsers(credentials);
      setUsers(usersData);
      setIsAdmin(
        credentials.username === "admin" ||
          usersData[credentials.username]?.role === "admin",
      );
      const clientUsers = Object.entries(usersData).filter(
        ([_, user]) => user.role === "client",
      );
      if (clientUsers.length > 0) {
        setSelectedClient(clientUsers[0][0]);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, [credentials]);

  const loadDeviceList = useCallback(
    async (clientId?: string) => {
      try {
        setLoading(true);
        const fetchList = overrides.fetchDeviceListFn ?? fetchDeviceList;
        const result = await fetchList({
          credentials,
          viewToken,
          clientId,
          isAdmin,
        });
        setDevices(result.devices || []);
        setDataSources(result.data_sources || []);
        setError(null);
      } catch (err) {
        setError(
          `Failed to load device information: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        );
      } finally {
        setLoading(false);
      }
    },
    [credentials, isAdmin, viewToken],
  );

  const loadDataSources = useCallback(async () => {
    try {
      let clientToLoad = isAdmin ? selectedClient : credentials.username;
      if (viewToken && Object.keys(users).length > 0) {
        const clientUsers = Object.entries(users).filter(
          ([_, user]) => user.role === "client",
        );
        if (clientUsers.length > 0) {
          clientToLoad = clientUsers[0][0];
        }
      }
      if (!clientToLoad) {
        return;
      }
      if (users[clientToLoad]?.data_sources) {
        setDataSources(users[clientToLoad].data_sources || []);
        return;
      }
      if (isAdmin && !viewToken) {
        const fetchSources =
          overrides.fetchDeviceDataSourcesFn ?? fetchDeviceDataSources;
        const sources = await fetchSources(credentials, clientToLoad);
        setDataSources(sources);
      }
    } catch (err) {
      console.error("Failed to fetch data sources:", err);
      setDataSources([]);
    }
  }, [
    credentials,
    isAdmin,
    overrides.fetchDeviceDataSourcesFn,
    selectedClient,
    users,
    viewToken,
  ]);

  useEffect(() => {
    if (!viewToken && !isDemo) {
      loadUsers();
    }
  }, [isDemo, loadUsers, viewToken]);

  useEffect(() => {
    if (isDemo) {
      setIsAdmin(false);
      loadDeviceList();
      return;
    }
    if (isAdmin && selectedClient) {
      loadDeviceList(selectedClient);
    } else if (!isAdmin) {
      loadDeviceList();
    }
  }, [isAdmin, isDemo, loadDeviceList, selectedClient]);

  useEffect(() => {
    if (isDemo) {
      return;
    }
    loadDataSources();
  }, [isDemo, loadDataSources]);

  const clientUsers = useMemo(
    () => Object.entries(users).filter(([_, user]) => user.role === "client"),
    [users],
  );

  const refreshDevices = useCallback(() => {
    if (isAdmin && selectedClient) {
      loadDeviceList(selectedClient);
    } else {
      loadDeviceList();
    }
  }, [isAdmin, loadDeviceList, selectedClient]);

  const downloadDataSource = useCallback(
    async (sourceUrl: string, sourceName: string) => {
      try {
        const csvData = await fetchDataSourceCsv(sourceUrl);
        const blob = new Blob([csvData], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${sourceName.replace(/[^a-z0-9]/gi, "_")}_data.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Download failed:", err);
        alert("Failed to download data source");
      }
    },
    [],
  );

  return {
    devices,
    dataSources,
    loading,
    error,
    isAdmin,
    selectedClient,
    setSelectedClient,
    clientUsers,
    refreshDevices,
    downloadDataSource,
  };
};
