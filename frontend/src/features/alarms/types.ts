export interface AlarmEvent {
  id: string;
  instance: string;
  device: string;
  description: string;
  alarmStartedAt: string;
  alarmClearedAfter: string | null;
  severity: "high" | "medium" | "low";
}

export interface AlarmUser {
  role: "admin" | "client";
  name: string;
  csv_url?: string;
}
