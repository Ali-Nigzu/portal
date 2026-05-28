import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Credentials } from "../../../types/credentials";
import { isDemoSessionActive } from "../../../lib/demoSession";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import type { DataSource, DeviceInfo, DeviceUser } from "../types";
import { fetchDeviceList } from "../transport/fetchDeviceList";
import { fetchDeviceUsers } from "../transport/fetchDeviceUsers";
import { fetchDeviceDataSources } from "../transport/fetchDeviceDataSources";
import { fetchDataSourceCsv } from "../transport/fetchDataSourceCsv";
import { getDemoDevicesForScope, toDeviceInfo } from "../demoDevices";

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
  isDemoSession: boolean;
  activeSiteId: string;
};

export const useDeviceList = (
  credentials: Credentials,
): DeviceListState => {
  const { siteId = "all" } = useParams<{ siteId: string }>();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<DeviceUsersMap>({});
  const [selectedClient, setSelectedClient] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);

  const viewToken = getViewTokenFromLocation();
  const isDemoSession =
    isDemoSessionActive() ||
    (typeof window !== "undefined" &&
      window.location.pathname.startsWith("/demo/"));

  const loadUsers = useCallback(async () => {
    try {
      const usersData = await fetchDeviceUsers(credentials);
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
        if (isDemoSession) {
          const scopedDevices = getDemoDevicesForScope(siteId).map(toDeviceInfo);
          setDevices(scopedDevices);
          setDataSources([]);
          setError(null);
          return;
        }
        const result = await fetchDeviceList({
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
    [credentials, isAdmin, isDemoSession, siteId, viewToken],
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
        const sources = await fetchDeviceDataSources(credentials, clientToLoad);
        setDataSources(sources);
      }
    } catch (err) {
      console.error("Failed to fetch data sources:", err);
      setDataSources([]);
    }
  }, [credentials, isAdmin, selectedClient, users, viewToken]);

  useEffect(() => {
    if (!viewToken && !isDemoSession) {
      loadUsers();
    }
  }, [isDemoSession, loadUsers, viewToken]);

  useEffect(() => {
    if (isDemoSession) {
      setIsAdmin(false);
      loadDeviceList();
      return;
    }
    if (isAdmin && selectedClient) {
      loadDeviceList(selectedClient);
    } else if (!isAdmin) {
      loadDeviceList();
    }
  }, [isAdmin, isDemoSession, loadDeviceList, selectedClient]);

  useEffect(() => {
    if (isDemoSession) {
      return;
    }
    loadDataSources();
  }, [isDemoSession, loadDataSources]);

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
    isDemoSession,
    activeSiteId: siteId,
  };
};
