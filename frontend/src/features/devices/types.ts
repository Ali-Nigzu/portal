export interface DeviceInfo {
  id: string;
  name: string;
  type: "Camera" | "Sensor" | "Gateway" | "Door";
  status: "online" | "offline" | "maintenance";
  lastSeen: string;
  lastSeenLabel?: string;
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

export type CanonicalDevice = {
  ref: string;
  kind: "device" | "gateway";
  site_id: string;
  site_name: string;
  name: string;
  canonical_enabled: boolean;
  last_activity: string | null;
  runtime_state: "online" | "offline";
  records: number | null;
  records_status: "available" | "unavailable";
};

export type DeviceListResponse = {
  scope: { organisation_id: string; site_id: string | null };
  records_status: "available" | "unavailable";
  items: CanonicalDevice[];
};
