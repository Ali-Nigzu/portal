export type EventDeviceToken =
  | "site-a:gateway"
  | "site-a:cam-0"
  | "site-a:cam-1"
  | "site-b:gateway"
  | "site-b:cam-0"
  | "site-b:cam-1"
  | "site-b:cam-2";

export type EventDeviceOption = {
  token: EventDeviceToken;
  label: string;
  siteId: 0 | 1;
  cameraId?: 0 | 1 | 2;
  kind: "gateway" | "camera";
};

export const EVENT_DEVICE_OPTIONS: EventDeviceOption[] = [
  { token: "site-a:gateway", label: "AB: Gateway", siteId: 0, kind: "gateway" },
  { token: "site-a:cam-0", label: "AB: Main Door Camera", siteId: 0, cameraId: 0, kind: "camera" },
  { token: "site-a:cam-1", label: "AB: Back Door Camera", siteId: 0, cameraId: 1, kind: "camera" },
  { token: "site-b:gateway", label: "TT: Gateway 1", siteId: 1, kind: "gateway" },
  { token: "site-b:cam-0", label: "TT: Main Door Camera", siteId: 1, cameraId: 0, kind: "camera" },
  { token: "site-b:cam-1", label: "TT: Delivery Door Camera", siteId: 1, cameraId: 1, kind: "camera" },
  { token: "site-b:cam-2", label: "TT: Back Door Camera", siteId: 1, cameraId: 2, kind: "camera" },
];

const EVENT_DEVICE_TOKEN_SET = new Set(EVENT_DEVICE_OPTIONS.map((option) => option.token));

export const isEventDeviceToken = (value: string): value is EventDeviceToken =>
  EVENT_DEVICE_TOKEN_SET.has(value as EventDeviceToken);

export const normalizeEventDeviceTokens = (values: unknown): EventDeviceToken[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const tokens: EventDeviceToken[] = [];
  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const normalized = value.trim().toLowerCase();
    if (isEventDeviceToken(normalized) && !tokens.includes(normalized)) {
      tokens.push(normalized);
    }
  });
  return tokens;
};

export const summarizeEventDeviceSelection = (tokens: EventDeviceToken[]): string => {
  if (tokens.length === 0) {
    return "All Devices";
  }
  if (tokens.length === 1) {
    return EVENT_DEVICE_OPTIONS.find((option) => option.token === tokens[0])?.label ?? "1 device selected";
  }
  return `${tokens.length} devices selected`;
};
