import type { AlarmEvent } from "./types";

const ALARM_CATALOG = {
  storageWarning: { description: "Storage utilisation exceeded 80%", severity: "medium" },
  storageCritical: { description: "Storage utilisation exceeded 95%", severity: "high" },
  gatewayOffline: { description: "Gateway heartbeat lost", severity: "high" },
  gatewayRestored: { description: "Gateway connection restored", severity: "low" },
  recordingRestarted: { description: "Recording service restarted", severity: "medium" },
  databaseMaintenance: { description: "Database maintenance completed", severity: "low" },
  cameraOffline: { description: "Device heartbeat lost", severity: "high" },
  cameraRestored: { description: "Device connection restored", severity: "low" },
  videoLost: { description: "Video stream unavailable", severity: "high" },
  videoRestored: { description: "Video stream restored", severity: "low" },
  deviceRestarted: { description: "Device restarted", severity: "medium" },
  occupancyThreshold: { description: "Occupancy threshold exceeded", severity: "medium" },
  queueThreshold: { description: "Queue threshold exceeded", severity: "medium" },
  analyticsDelay: { description: "Event processing delay detected", severity: "medium" },
  analyticsRestart: { description: "Analytics service restarted", severity: "medium" },
  repeatedAccess: { description: "Repeated access activity detected", severity: "medium" },
  restrictedArea: { description: "Restricted area activity detected", severity: "high" },
} as const;

type AlarmCatalogKey = keyof typeof ALARM_CATALOG;

type DemoAlarmDevice = {
  siteId: "site-a" | "site-b";
  siteName: string;
  device: string;
  gateway: boolean;
};

const DEMO_ALARM_DEVICES: DemoAlarmDevice[] = [
  { siteId: "site-b", siteName: "Tokis Takeout", device: "TT Gateway", gateway: true },
  { siteId: "site-b", siteName: "Tokis Takeout", device: "TT Main Door", gateway: false },
  { siteId: "site-b", siteName: "Tokis Takeout", device: "TT Delivery Door", gateway: false },
  { siteId: "site-b", siteName: "Tokis Takeout", device: "TT Back Door", gateway: false },
  { siteId: "site-a", siteName: "Ali’s Barber", device: "AB Gateway", gateway: true },
  { siteId: "site-a", siteName: "Ali’s Barber", device: "AB Main Door", gateway: false },
  { siteId: "site-a", siteName: "Ali’s Barber", device: "AB Back Door", gateway: false },
];

const CAMERA_ALARM_ROTATION: AlarmCatalogKey[] = [
  "cameraOffline",
  "cameraRestored",
  "occupancyThreshold",
  "queueThreshold",
  "cameraOffline",
  "cameraRestored",
  "deviceRestarted",
  "videoLost",
  "videoRestored",
  "analyticsDelay",
  "occupancyThreshold",
  "queueThreshold",
  "repeatedAccess",
  "analyticsRestart",
  "restrictedArea",
];

const GATEWAY_ALARM_ROTATION: AlarmCatalogKey[] = [
  "storageWarning",
  "databaseMaintenance",
  "recordingRestarted",
  "storageWarning",
  "gatewayRestored",
  "analyticsDelay",
  "storageCritical",
  "gatewayOffline",
];

const formatAlarmDate = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60 * 1000);

const resolveAlarmSiteScope = (siteId?: string | null): "site-a" | "site-b" | "all" => {
  switch ((siteId || "all").toLowerCase()) {
    case "ab":
    case "site-a":
      return "site-a";
    case "tt":
    case "site-b":
      return "site-b";
    default:
      return "all";
  }
};

const buildAlarm = ({
  index,
  device,
  catalogKey,
  startedAt,
  active = false,
  clearMinutes = 28,
}: {
  index: number;
  device: DemoAlarmDevice;
  catalogKey: AlarmCatalogKey;
  startedAt: Date;
  active?: boolean;
  clearMinutes?: number;
}): AlarmEvent => {
  const alarm = ALARM_CATALOG[catalogKey];
  return {
    id: `demo-alarm-${String(index).padStart(4, "0")}`,
    instance: `${device.siteId.toUpperCase()}-${String(index).padStart(4, "0")}`,
    site: device.siteName,
    device: device.device,
    description: alarm.description,
    alarmStartedAt: formatAlarmDate(startedAt),
    alarmClearedAfter: active ? null : formatAlarmDate(addMinutes(startedAt, clearMinutes)),
    severity: alarm.severity,
  };
};

const REQUIRED_CATALOG_SEEDS: AlarmCatalogKey[] = [
  "storageWarning",
  "storageCritical",
  "gatewayOffline",
  "gatewayRestored",
  "recordingRestarted",
  "databaseMaintenance",
  "cameraOffline",
  "cameraRestored",
  "videoLost",
  "videoRestored",
  "deviceRestarted",
  "occupancyThreshold",
  "queueThreshold",
  "analyticsDelay",
  "analyticsRestart",
  "repeatedAccess",
  "restrictedArea",
];

const buildHistoricalAlarms = () => {
  const start = new Date(Date.UTC(2024, 0, 4, 8, 15));
  const end = new Date();
  const totalHistorical = 756;
  const duration = end.getTime() - start.getTime();
  const alarms: AlarmEvent[] = [];

  for (let index = 0; index < totalHistorical; index += 1) {
    const seededCatalogKey = REQUIRED_CATALOG_SEEDS[index];
    const seededNeedsGateway = seededCatalogKey
      ? seededCatalogKey.startsWith("gateway") ||
        seededCatalogKey.startsWith("storage") ||
        seededCatalogKey === "recordingRestarted" ||
        seededCatalogKey === "databaseMaintenance"
      : false;
    const device = seededCatalogKey
      ? DEMO_ALARM_DEVICES.find((candidate) => candidate.gateway === seededNeedsGateway) || DEMO_ALARM_DEVICES[0]
      : DEMO_ALARM_DEVICES[index % DEMO_ALARM_DEVICES.length];
    const rotation = device.gateway ? GATEWAY_ALARM_ROTATION : CAMERA_ALARM_ROTATION;
    const catalogKey = seededCatalogKey || rotation[(index * 5 + (device.gateway ? 1 : 3)) % rotation.length];
    const offset = Math.floor((duration * index) / totalHistorical);
    const hourJitter = ((index * 37) % 11) * 60 * 60 * 1000;
    const minuteJitter = ((index * 17) % 53) * 60 * 1000;
    const startedAt = new Date(start.getTime() + offset + hourJitter + minuteJitter);
    const clearMinutes = 8 + ((index * 19) % 175);
    alarms.push(buildAlarm({ index: index + 1, device, catalogKey, startedAt, clearMinutes }));
  }

  const activeStartedBase = addMinutes(end, -74);
  const activeDefinitions: Array<{
    device: DemoAlarmDevice;
    catalogKey: AlarmCatalogKey;
    minutesAgo: number;
  }> = [
    { device: DEMO_ALARM_DEVICES[1], catalogKey: "videoLost", minutesAgo: 18 },
    { device: DEMO_ALARM_DEVICES[2], catalogKey: "queueThreshold", minutesAgo: 43 },
    { device: DEMO_ALARM_DEVICES[5], catalogKey: "occupancyThreshold", minutesAgo: 67 },
  ];

  activeDefinitions.forEach((definition, activeIndex) => {
    alarms.push(buildAlarm({
      index: totalHistorical + activeIndex + 1,
      device: definition.device,
      catalogKey: definition.catalogKey,
      startedAt: addMinutes(activeStartedBase, 74 - definition.minutesAgo),
      active: true,
    }));
  });

  return alarms.sort(
    (a, b) => new Date(b.alarmStartedAt).getTime() - new Date(a.alarmStartedAt).getTime(),
  );
};

const DEMO_ALARM_LOGS = buildHistoricalAlarms();

export const getDemoAlarmLogsForScope = (siteId?: string | null): AlarmEvent[] => {
  const scope = resolveAlarmSiteScope(siteId);
  if (scope === "all") {
    return DEMO_ALARM_LOGS;
  }
  return DEMO_ALARM_LOGS.filter((alarm) => {
    const device = DEMO_ALARM_DEVICES.find((candidate) => candidate.device === alarm.device);
    return device?.siteId === scope;
  });
};
