import { useCallback, useEffect, useMemo, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import { fetchAlarmLogs } from "../transport/fetchAlarmLogs";
import { fetchAlarmUsers } from "../transport/fetchAlarmUsers";
import type { AlarmEvent, AlarmUser } from "../types";

type AlarmUsersMap = Record<string, AlarmUser>;

type AlarmLogsState = {
  alarms: AlarmEvent[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  selectedClient: string;
  setSelectedClient: (value: string) => void;
  clientUsers: Array<[string, AlarmUser]>;
  activeAlarms: AlarmEvent[];
  clearedAlarms: AlarmEvent[];
  highSeverityAlarms: number;
  mediumSeverityAlarms: number;
  refreshAlarms: () => void;
};

type AlarmLogsOverrides = {
  isDemo?: boolean;
  fetchAlarmLogsFn?: typeof fetchAlarmLogs;
  fetchAlarmUsersFn?: typeof fetchAlarmUsers;
  viewToken?: string | null;
};

export const useAlarmLogs = (
  credentials: Credentials,
  overrides: AlarmLogsOverrides = {},
): AlarmLogsState => {
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AlarmUsersMap>({});
  const [selectedClient, setSelectedClient] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const viewToken =
    overrides.viewToken !== undefined
      ? overrides.viewToken
      : getViewTokenFromLocation();
  const isDemo = Boolean(overrides.isDemo);

  const loadUsers = useCallback(async () => {
    try {
      const fetchUsers = overrides.fetchAlarmUsersFn ?? fetchAlarmUsers;
      const data = await fetchUsers(credentials);
      setUsers(data);
      setIsAdmin(
        credentials.username === "admin" ||
          data[credentials.username]?.role === "admin",
      );
      const clientUsers = Object.entries(data).filter(
        ([_, user]) => user.role === "client",
      );
      if (clientUsers.length > 0) {
        setSelectedClient(clientUsers[0][0]);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, [credentials]);

  const loadAlarms = useCallback(
    async (clientId?: string) => {
      try {
        setLoading(true);
        const fetchLogs = overrides.fetchAlarmLogsFn ?? fetchAlarmLogs;
        const result = await fetchLogs({
          credentials,
          viewToken,
          clientId,
          isAdmin,
        });
        setAlarms(result);
        setError(null);
      } catch (err) {
        setError(
          `Failed to load alarm logs: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        );
      } finally {
        setLoading(false);
      }
    },
    [credentials, isAdmin, viewToken],
  );

  useEffect(() => {
    if (!viewToken && !isDemo) {
      loadUsers();
    }
  }, [isDemo, loadUsers, viewToken]);

  useEffect(() => {
    if (isDemo) {
      setIsAdmin(false);
      loadAlarms();
      return;
    }
    if (isAdmin && selectedClient) {
      loadAlarms(selectedClient);
    } else if (!isAdmin) {
      loadAlarms();
    }
  }, [isAdmin, isDemo, loadAlarms, selectedClient]);

  const clientUsers = useMemo(
    () => Object.entries(users).filter(([_, user]) => user.role === "client"),
    [users],
  );

  const activeAlarms = useMemo(
    () => alarms.filter((alarm) => !alarm.alarmClearedAfter),
    [alarms],
  );

  const clearedAlarms = useMemo(
    () => alarms.filter((alarm) => alarm.alarmClearedAfter),
    [alarms],
  );

  const highSeverityAlarms = useMemo(
    () => alarms.filter((alarm) => alarm.severity === "high").length,
    [alarms],
  );

  const mediumSeverityAlarms = useMemo(
    () => alarms.filter((alarm) => alarm.severity === "medium").length,
    [alarms],
  );

  const refreshAlarms = useCallback(() => {
    if (isAdmin && selectedClient) {
      loadAlarms(selectedClient);
    } else {
      loadAlarms();
    }
  }, [isAdmin, loadAlarms, selectedClient]);

  return {
    alarms,
    loading,
    error,
    isAdmin,
    selectedClient,
    setSelectedClient,
    clientUsers,
    activeAlarms,
    clearedAlarms,
    highSeverityAlarms,
    mediumSeverityAlarms,
    refreshAlarms,
  };
};
