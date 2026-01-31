import { useCallback, useEffect, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import type { AlarmEvent, NewAlarmPayload } from "../types";
import {
  createAlarm,
  deleteAlarm,
  fetchAlarmLogs,
  updateAlarm,
} from "../transport/alarms";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type UseAdminAlarmsParams = {
  credentials: Credentials;
  selectedClient: string;
  active: boolean;
  onAlert: (alert: AlertPayload | null) => void;
};

type UseAdminAlarmsResult = {
  alarms: AlarmEvent[];
  reloadAlarms: () => void;
  addAlarm: (payload: NewAlarmPayload) => Promise<boolean>;
  updateAlarm: (payload: AlarmEvent) => Promise<boolean>;
  deleteAlarm: (alarmId: string) => Promise<void>;
};

export const useAdminAlarms = ({
  credentials,
  selectedClient,
  active,
  onAlert,
}: UseAdminAlarmsParams): UseAdminAlarmsResult => {
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);

  const loadAlarms = useCallback(async () => {
    if (!selectedClient) {
      return;
    }
    try {
      const data = await fetchAlarmLogs(credentials, selectedClient);
      setAlarms(data);
    } catch (err) {
      onAlert({ message: "Failed to load alarms", type: "error" });
    }
  }, [credentials, onAlert, selectedClient]);

  useEffect(() => {
    if (active && selectedClient) {
      loadAlarms();
    }
  }, [active, loadAlarms, selectedClient]);

  const reloadAlarms = useCallback(() => {
    loadAlarms();
  }, [loadAlarms]);

  const addAlarm = useCallback(
    async (payload: NewAlarmPayload) => {
      try {
        const data = await createAlarm(credentials, payload);
        if (data.success) {
          onAlert({ message: "Alarm created successfully", type: "success" });
          reloadAlarms();
          return true;
        }
        onAlert({ message: "Failed to create alarm", type: "error" });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to create alarm", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadAlarms],
  );

  const updateAlarmEntry = useCallback(
    async (payload: AlarmEvent) => {
      try {
        const data = await updateAlarm(credentials, payload);
        if (data.success) {
          onAlert({ message: "Alarm updated successfully", type: "success" });
          reloadAlarms();
          return true;
        }
        onAlert({ message: "Failed to update alarm", type: "error" });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to update alarm", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadAlarms],
  );

  const removeAlarm = useCallback(
    async (alarmId: string) => {
      try {
        const data = await deleteAlarm(credentials, alarmId);
        if (data.success) {
          onAlert({ message: "Alarm deleted successfully", type: "success" });
          reloadAlarms();
        } else {
          onAlert({ message: "Failed to delete alarm", type: "error" });
        }
      } catch (err) {
        onAlert({ message: "Failed to delete alarm", type: "error" });
      }
    },
    [credentials, onAlert, reloadAlarms],
  );

  return {
    alarms,
    reloadAlarms,
    addAlarm,
    updateAlarm: updateAlarmEntry,
    deleteAlarm: removeAlarm,
  };
};
