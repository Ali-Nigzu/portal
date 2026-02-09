import { API_BASE_URL } from "../../../config";
import { isDemoSessionActive } from "../../../lib/demoSession";
import type { Credentials } from "../../../types/credentials";
import type { AlarmEvent } from "../types";

type FetchAlarmLogsParams = {
  credentials: Credentials;
  viewToken: string | null;
  clientId?: string;
  isAdmin: boolean;
};

type AlarmLogsResponse = {
  alarms?: AlarmEvent[];
};

export const fetchAlarmLogs = async ({
  credentials,
  viewToken,
  clientId,
  isAdmin,
}: FetchAlarmLogsParams): Promise<AlarmEvent[]> => {
  const isDemoSession = isDemoSessionActive();
  let apiUrl = `${API_BASE_URL}/api/alarm-logs`;
  const headers: HeadersInit = { "Content-Type": "application/json" };

  if (viewToken) {
    apiUrl += `?view_token=${encodeURIComponent(viewToken)}`;
  } else if (!isDemoSession) {
    const auth = btoa(`${credentials.username}:${credentials.password}`);
    headers.Authorization = `Basic ${auth}`;
    if (isAdmin && clientId) {
      apiUrl += `?client_id=${encodeURIComponent(clientId)}`;
    }
  }

  const response = await fetch(apiUrl, {
    headers,
    credentials: isDemoSession ? "include" : "same-origin",
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as AlarmLogsResponse;
  return result.alarms || [];
};
