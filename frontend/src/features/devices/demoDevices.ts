import type { DeviceInfo } from "./types";

export type DemoDevice = {
  id: string;
  siteId: "ab" | "tt";
  siteName: string;
  label: string;
  type: "gateway" | "camera" | "door";
  location: string;
  online: boolean;
};

export const DEMO_DEVICES: DemoDevice[] = [
  {
    id: "gateway-ab",
    siteId: "ab",
    siteName: "Ali’s Barber",
    label: "AB Gateway",
    type: "gateway",
    location: "Front Counter",
    online: true,
  },
  {
    id: "main-door-ab",
    siteId: "ab",
    siteName: "Ali’s Barber",
    label: "AB Main Door",
    type: "door",
    location: "Entrance",
    online: true,
  },
  {
    id: "back-door-ab",
    siteId: "ab",
    siteName: "Ali’s Barber",
    label: "AB Back Door",
    type: "door",
    location: "Rear Exit",
    online: false,
  },
  {
    id: "gateway-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Gateway",
    type: "gateway",
    location: "Kitchen Network",
    online: true,
  },
  {
    id: "main-door-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Main Door",
    type: "door",
    location: "Customer Entrance",
    online: true,
  },
  {
    id: "delivery-door-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Delivery Door",
    type: "door",
    location: "Delivery Pickup Area",
    online: true,
  },
  {
    id: "back-door-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Back Door",
    type: "door",
    location: "Service Exit",
    online: false,
  },
];

export const resolveDemoSiteScope = (
  siteId?: string | null,
): DemoDevice["siteId"] | "all" => {
  switch ((siteId || "all").toLowerCase()) {
    case "site-a":
    case "ab":
      return "ab";
    case "site-b":
    case "tt":
      return "tt";
    default:
      return "all";
  }
};

export const getDemoDevicesForScope = (siteId?: string | null): DemoDevice[] => {
  const scope = resolveDemoSiteScope(siteId);
  if (scope === "all") {
    return DEMO_DEVICES;
  }
  return DEMO_DEVICES.filter((device) => device.siteId === scope);
};

const demoTypeLabel = (type: DemoDevice["type"]): DeviceInfo["type"] => {
  switch (type) {
    case "gateway":
      return "Gateway";
    case "camera":
      return "Camera";
    case "door":
      return "Door";
    default:
      return "Sensor";
  }
};

export const toDeviceInfo = (device: DemoDevice, index: number): DeviceInfo => ({
  id: device.id,
  name: device.label,
  type: demoTypeLabel(device.type),
  status: device.online ? "online" : "offline",
  lastSeen: device.online
    ? new Date("2026-05-28T18:24:00Z").toISOString()
    : new Date("2026-05-28T16:48:00Z").toISOString(),
  location: device.location,
  recordCount: device.online ? 1280 + index * 137 : 0,
  siteId: device.siteId,
  siteName: device.siteName,
});
