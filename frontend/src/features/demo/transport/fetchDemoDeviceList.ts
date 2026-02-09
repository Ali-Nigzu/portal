import type { DataSource, DeviceInfo } from "../../devices/types";

type DeviceListResponse = {
  devices?: DeviceInfo[];
  data_sources?: DataSource[];
};

export const fetchDemoDeviceList = async (): Promise<DeviceListResponse> => {
  const response = await fetch("/api/demo/device-list", {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const result = (await response.json()) as DeviceListResponse;
  return {
    devices: result.devices || [],
    data_sources: result.data_sources || [],
  };
};
