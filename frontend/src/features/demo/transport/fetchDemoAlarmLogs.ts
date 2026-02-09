import type { AlarmEvent } from "../../alarms/types";

type AlarmLogsResponse = {
  alarms?: AlarmEvent[];
};

export const fetchDemoAlarmLogs = async (): Promise<AlarmEvent[]> => {
  const response = await fetch("/api/demo/alarm-logs", {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const result = (await response.json()) as AlarmLogsResponse;
  return result.alarms || [];
};
