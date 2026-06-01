export type DemoEventToken =
  | "site-a:cam-0"
  | "site-a:cam-1"
  | "site-b:cam-0"
  | "site-b:cam-1"
  | "site-b:cam-2";

type DemoSiteId = "ab" | "tt";

type DemoRuntimeEventProfile = {
  deviceToken: DemoEventToken;
  siteId: DemoSiteId;
  camId: 0 | 1 | 2;
  startsAt: string;
  days: number;
  hourlyTraffic: number[];
};

export type DemoRuntimeEvent = {
  id: string;
  deviceToken: DemoEventToken;
  siteId: DemoSiteId;
  camId: 0 | 1 | 2;
  event: "entry" | "exit";
  timestamp: string;
};

const HOURS_PER_DAY = 24;
const HOUR_IN_MS = 60 * 60 * 1000;

const DEMO_RUNTIME_EVENT_PROFILES: DemoRuntimeEventProfile[] = [
  {
    deviceToken: "site-a:cam-0",
    siteId: "ab",
    camId: 0,
    startsAt: "2026-05-01T00:00:00Z",
    days: 28,
    hourlyTraffic: [0, 0, 0, 0, 0, 0, 4, 12, 24, 30, 28, 24, 22, 24, 26, 30, 34, 30, 20, 8, 0, 0, 0, 0],
  },
  {
    deviceToken: "site-a:cam-1",
    siteId: "ab",
    camId: 1,
    startsAt: "2026-05-01T00:00:00Z",
    days: 28,
    hourlyTraffic: [0, 0, 0, 0, 0, 0, 1, 3, 6, 8, 9, 8, 7, 7, 8, 9, 10, 8, 4, 1, 0, 0, 0, 0],
  },
  {
    deviceToken: "site-b:cam-0",
    siteId: "tt",
    camId: 0,
    startsAt: "2026-05-01T00:00:00Z",
    days: 28,
    hourlyTraffic: [0, 0, 0, 0, 0, 2, 8, 14, 18, 24, 32, 40, 42, 34, 30, 28, 32, 44, 50, 42, 28, 16, 6, 0],
  },
  {
    deviceToken: "site-b:cam-1",
    siteId: "tt",
    camId: 1,
    startsAt: "2026-05-01T00:00:00Z",
    days: 28,
    hourlyTraffic: [0, 0, 0, 0, 0, 4, 10, 12, 8, 6, 8, 14, 18, 16, 12, 10, 12, 14, 12, 10, 6, 2, 0, 0],
  },
  {
    deviceToken: "site-b:cam-2",
    siteId: "tt",
    camId: 2,
    startsAt: "2026-05-01T00:00:00Z",
    days: 28,
    hourlyTraffic: [0, 0, 0, 0, 0, 3, 5, 6, 4, 3, 4, 8, 10, 8, 6, 5, 6, 8, 7, 5, 3, 1, 0, 0],
  },
];

const assertHourlyProfile = (profile: DemoRuntimeEventProfile): void => {
  if (profile.hourlyTraffic.length !== HOURS_PER_DAY) {
    throw new Error(`${profile.deviceToken} must define ${HOURS_PER_DAY} hourly traffic buckets`);
  }
};

const generateRuntimeEvents = (profile: DemoRuntimeEventProfile): DemoRuntimeEvent[] => {
  assertHourlyProfile(profile);

  const events: DemoRuntimeEvent[] = [];
  const startMs = Date.parse(profile.startsAt);
  let eventIndex = 0;

  for (let day = 0; day < profile.days; day += 1) {
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
      const eventsThisHour = profile.hourlyTraffic[hour];
      for (let eventOffset = 0; eventOffset < eventsThisHour; eventOffset += 1) {
        const timestampMs =
          startMs +
          (day * HOURS_PER_DAY + hour) * HOUR_IN_MS +
          Math.floor(((eventOffset + 1) * HOUR_IN_MS) / (eventsThisHour + 1));

        events.push({
          id: `${profile.deviceToken}:${eventIndex}`,
          deviceToken: profile.deviceToken,
          siteId: profile.siteId,
          camId: profile.camId,
          event: eventIndex % 2 === 0 ? "entry" : "exit",
          timestamp: new Date(timestampMs).toISOString(),
        });

        eventIndex += 1;
      }
    }
  }

  return events;
};

export const DEMO_RUNTIME_EVENTS: DemoRuntimeEvent[] = DEMO_RUNTIME_EVENT_PROFILES.flatMap(
  generateRuntimeEvents,
);

export const countDemoRuntimeEvents = (deviceTokens: DemoEventToken[]): number => {
  const tokenSet = new Set(deviceTokens);
  return DEMO_RUNTIME_EVENTS.reduce(
    (total, event) => total + (tokenSet.has(event.deviceToken) ? 1 : 0),
    0,
  );
};
