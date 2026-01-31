import { API_BASE_URL } from "../../../config";
import type { Credentials } from "../../../types/credentials";
import type { AlarmEvent, NewAlarmPayload } from "../types";

type AlarmLogsResponse = {
  alarms?: AlarmEvent[];
};

type AlarmMutationResponse = {
  success?: boolean;
};

const buildAuthHeaders = (credentials: Credentials) => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
};

export const fetchAlarmLogs = async (
  credentials: Credentials,
  clientId: string,
): Promise<AlarmEvent[]> => {
  const response = await fetch(
    `${API_BASE_URL}/api/alarm-logs?client_id=${clientId}`,
    {
      headers: buildAuthHeaders(credentials),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to load alarms");
  }

  const data = (await response.json()) as AlarmLogsResponse;
  return data.alarms || [];
};

export const createAlarm = async (
  credentials: Credentials,
  payload: NewAlarmPayload,
): Promise<AlarmMutationResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/admin/alarm-logs`, {
    method: "POST",
    headers: buildAuthHeaders(credentials),
    body: JSON.stringify(payload),
  });

  return (await response.json()) as AlarmMutationResponse;
};

export const updateAlarm = async (
  credentials: Credentials,
  alarm: AlarmEvent,
): Promise<AlarmMutationResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/alarm-logs/${alarm.id}`,
    {
      method: "PUT",
      headers: buildAuthHeaders(credentials),
      body: JSON.stringify(alarm),
    },
  );

  return (await response.json()) as AlarmMutationResponse;
};

export const deleteAlarm = async (
  credentials: Credentials,
  alarmId: string,
): Promise<AlarmMutationResponse> => {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  const response = await fetch(
    `${API_BASE_URL}/api/admin/alarm-logs/${alarmId}`,
    { method: "DELETE", headers: { Authorization: `Basic ${auth}` } },
  );

  return (await response.json()) as AlarmMutationResponse;
};
