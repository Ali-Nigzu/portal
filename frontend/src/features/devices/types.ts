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
