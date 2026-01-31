import { useCallback, useEffect, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import type { DeviceInfo, NewDevicePayload } from "../types";
import {
  createDevice,
  deleteDevice,
  fetchDeviceList,
  updateDevice,
} from "../transport/devices";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type UseAdminDevicesParams = {
  credentials: Credentials;
  selectedClient: string;
  active: boolean;
  onAlert: (alert: AlertPayload | null) => void;
};

type UseAdminDevicesResult = {
  devices: DeviceInfo[];
  reloadDevices: () => void;
  addDevice: (payload: NewDevicePayload) => Promise<boolean>;
  updateDevice: (payload: DeviceInfo) => Promise<boolean>;
  deleteDevice: (deviceId: string) => Promise<void>;
};

export const useAdminDevices = ({
  credentials,
  selectedClient,
  active,
  onAlert,
}: UseAdminDevicesParams): UseAdminDevicesResult => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

  const loadDevices = useCallback(async () => {
    if (!selectedClient) {
      return;
    }
    try {
      const data = await fetchDeviceList(credentials, selectedClient);
      setDevices(data);
    } catch (err) {
      onAlert({ message: "Failed to load devices", type: "error" });
    }
  }, [credentials, onAlert, selectedClient]);

  useEffect(() => {
    if (active && selectedClient) {
      loadDevices();
    }
  }, [active, loadDevices, selectedClient]);

  const reloadDevices = useCallback(() => {
    loadDevices();
  }, [loadDevices]);

  const addDeviceEntry = useCallback(
    async (payload: NewDevicePayload) => {
      try {
        const data = await createDevice(credentials, payload);
        if (data.success) {
          onAlert({ message: "Device created successfully", type: "success" });
          reloadDevices();
          return true;
        }
        onAlert({ message: "Failed to create device", type: "error" });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to create device", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadDevices],
  );

  const updateDeviceEntry = useCallback(
    async (payload: DeviceInfo) => {
      try {
        const data = await updateDevice(credentials, payload);
        if (data.success) {
          onAlert({ message: "Device updated successfully", type: "success" });
          reloadDevices();
          return true;
        }
        onAlert({ message: "Failed to update device", type: "error" });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to update device", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadDevices],
  );

  const removeDevice = useCallback(
    async (deviceId: string) => {
      try {
        const data = await deleteDevice(credentials, deviceId);
        if (data.success) {
          onAlert({ message: "Device deleted successfully", type: "success" });
          reloadDevices();
        } else {
          onAlert({ message: "Failed to delete device", type: "error" });
        }
      } catch (err) {
        onAlert({ message: "Failed to delete device", type: "error" });
      }
    },
    [credentials, onAlert, reloadDevices],
  );

  return {
    devices,
    reloadDevices,
    addDevice: addDeviceEntry,
    updateDevice: updateDeviceEntry,
    deleteDevice: removeDevice,
  };
};
