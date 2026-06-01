export interface DeviceInfo {
  id: string;
  name: string;
  type: "Camera" | "Sensor" | "Gateway" | "Door";
  status: "online" | "offline" | "maintenance";
  lastSeen: string;
  dataSource?: string;
  location?: string;
  recordCount?: number;
  siteId?: string;
  siteName?: string;
}

export interface DataSource {
  id: string;
  title: string;
  url: string;
  type: string;
  active?: boolean;
}

export interface DeviceUser {
  role: "admin" | "client";
  name: string;
  csv_url?: string;
  data_sources?: DataSource[];
}
