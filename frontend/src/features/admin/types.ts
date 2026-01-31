export type AdminRole = "client" | "admin";

export interface DataSource {
  id: string;
  title: string;
  url: string;
  type: "Camera" | "Sensor" | "Gateway";
  active?: boolean;
  client_id: string;
}

export interface AdminUser {
  username: string;
  name: string;
  role: AdminRole;
  csv_url?: string;
  last_login?: string | null;
  data_sources?: DataSource[];
}

export interface AlarmEvent {
  id: string;
  instance: string;
  device: string;
  description: string;
  alarmStartedAt: string;
  alarmClearedAfter: string | null;
  severity: string;
  client_id: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  lastSeen: string;
  dataSource?: string;
  location?: string;
  recordCount?: number;
  client_id: string;
}

export type NewAlarmPayload = Omit<AlarmEvent, "id">;
export type NewDevicePayload = Omit<DeviceInfo, "id">;
