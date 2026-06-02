import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Credentials } from "../../../types/credentials";
import { isDemoSessionActive } from "../../../lib/demoSession";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import { fetchAlarmLogs } from "../transport/fetchAlarmLogs";
import { fetchAlarmUsers } from "../transport/fetchAlarmUsers";
import type { AlarmEvent, AlarmUser } from "../types";
import { getDemoAlarmLogsForScope } from "../demoAlarmLogs";

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
  refreshAlarms: () => void;
};

export const useAlarmLogs = (
  credentials: Credentials,
): AlarmLogsState => {
  const { siteId = "all" } = useParams<{ siteId: string }>();
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AlarmUsersMap>({});
  const [selectedClient, setSelectedClient] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const viewToken = getViewTokenFromLocation();
  const isDemoSession =
    isDemoSessionActive() ||
    (typeof window !== "undefined" &&
      window.location.pathname.startsWith("/demo/"));

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchAlarmUsers(credentials);
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
        if (isDemoSession) {
          setAlarms(getDemoAlarmLogsForScope(siteId));
          setError(null);
          return;
        }
        const result = await fetchAlarmLogs({
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
    [credentials, isAdmin, isDemoSession, siteId, viewToken],
  );

  useEffect(() => {
    if (!viewToken && !isDemoSession) {
      loadUsers();
    }
  }, [isDemoSession, loadUsers, viewToken]);

  useEffect(() => {
    if (isDemoSession) {
      setIsAdmin(false);
      loadAlarms();
      return;
    }
    if (isAdmin && selectedClient) {
      loadAlarms(selectedClient);
    } else if (!isAdmin) {
      loadAlarms();
    }
  }, [isAdmin, isDemoSession, loadAlarms, selectedClient]);

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
    refreshAlarms,
  };
};
