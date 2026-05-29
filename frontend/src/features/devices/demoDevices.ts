import type { DeviceInfo } from "./types";

type DemoEventToken =
  | "site-a:cam-0"
  | "site-a:cam-1"
  | "site-b:cam-0"
  | "site-b:cam-1"
  | "site-b:cam-2";

export type DemoDevice = {
  id: string;
  siteId: "ab" | "tt";
  siteName: string;
  label: string;
  type: "gateway" | "camera" | "door";
  location: string;
  online: boolean;
  eventTokens: DemoEventToken[];
};

const DEMO_EVENT_RECORD_COUNTS: Record<DemoEventToken, number> = {
  "site-a:cam-0": 162,
  "site-a:cam-1": 47,
  "site-b:cam-0": 184,
  "site-b:cam-1": 126,
  "site-b:cam-2": 39,
};

const getDemoRecordCount = (eventTokens: DemoEventToken[]): number =>
  eventTokens.reduce((total, token) => total + DEMO_EVENT_RECORD_COUNTS[token], 0);

export const DEMO_DEVICES: DemoDevice[] = [
  {
    id: "gateway-ab",
    siteId: "ab",
    siteName: "Ali’s Barber",
    label: "AB Gateway",
    type: "gateway",
    location: "Front Counter",
    online: true,
    eventTokens: ["site-a:cam-0", "site-a:cam-1"],
  },
  {
    id: "main-door-ab",
    siteId: "ab",
    siteName: "Ali’s Barber",
    label: "AB Main Door",
    type: "door",
    location: "Entrance",
    online: true,
    eventTokens: ["site-a:cam-0"],
  },
  {
    id: "back-door-ab",
    siteId: "ab",
    siteName: "Ali’s Barber",
    label: "AB Back Door",
    type: "door",
    location: "Rear Exit",
    online: false,
    eventTokens: ["site-a:cam-1"],
  },
  {
    id: "gateway-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Gateway",
    type: "gateway",
    location: "Kitchen Network",
    online: true,
    eventTokens: ["site-b:cam-0", "site-b:cam-1", "site-b:cam-2"],
  },
  {
    id: "main-door-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Main Door",
    type: "door",
    location: "Customer Entrance",
    online: true,
    eventTokens: ["site-b:cam-0"],
  },
  {
    id: "delivery-door-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Delivery Door",
    type: "door",
    location: "Delivery Pickup Area",
    online: true,
    eventTokens: ["site-b:cam-1"],
  },
  {
    id: "back-door-tt",
    siteId: "tt",
    siteName: "Tokis Takeout",
    label: "TT Back Door",
    type: "door",
    location: "Service Exit",
    online: false,
    eventTokens: ["site-b:cam-2"],
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

export const toDeviceInfo = (device: DemoDevice): DeviceInfo => ({
  id: device.id,
  name: device.label,
  type: demoTypeLabel(device.type),
  status: device.online ? "online" : "offline",
  lastSeen: device.online
    ? new Date("2026-05-28T18:24:00Z").toISOString()
    : new Date("2026-05-28T16:48:00Z").toISOString(),
  location: device.location,
  recordCount: getDemoRecordCount(device.eventTokens),
  siteId: device.siteId,
  siteName: device.siteName,
});
