export type DemoEventToken =
  | "site-a:cam-0"
  | "site-a:cam-1"
  | "site-b:cam-0"
  | "site-b:cam-1"
  | "site-b:cam-2";

type DemoSiteId = "ab" | "tt";

type DemoRuntimeEventSeries = {
  deviceToken: DemoEventToken;
  siteId: DemoSiteId;
  camId: 0 | 1 | 2;
  startsAt: string;
  endsAt: string;
  intervalMinutes: number;
  pauseEvery: number;
  pauseMinutes: number;
};

export type DemoRuntimeEvent = {
  id: string;
  deviceToken: DemoEventToken;
  siteId: DemoSiteId;
  camId: 0 | 1 | 2;
  event: "entry" | "exit";
  timestamp: string;
};

const MINUTE_IN_MS = 60 * 1000;

const DEMO_RUNTIME_EVENT_SERIES: DemoRuntimeEventSeries[] = [
  {
    deviceToken: "site-a:cam-0",
    siteId: "ab",
    camId: 0,
    startsAt: "2026-05-24T07:42:00Z",
    endsAt: "2026-05-28T18:24:00Z",
    intervalMinutes: 40,
    pauseEvery: 8,
    pauseMinutes: 18,
  },
  {
    deviceToken: "site-a:cam-1",
    siteId: "ab",
    camId: 1,
    startsAt: "2026-05-27T09:14:00Z",
    endsAt: "2026-05-28T16:48:00Z",
    intervalMinutes: 43,
    pauseEvery: 6,
    pauseMinutes: 22,
  },
  {
    deviceToken: "site-b:cam-0",
    siteId: "tt",
    camId: 0,
    startsAt: "2026-05-24T10:03:00Z",
    endsAt: "2026-05-28T18:24:00Z",
    intervalMinutes: 35,
    pauseEvery: 9,
    pauseMinutes: 24,
  },
  {
    deviceToken: "site-b:cam-1",
    siteId: "tt",
    camId: 1,
    startsAt: "2026-05-25T11:18:00Z",
    endsAt: "2026-05-28T18:24:00Z",
    intervalMinutes: 37,
    pauseEvery: 7,
    pauseMinutes: 19,
  },
  {
    deviceToken: "site-b:cam-2",
    siteId: "tt",
    camId: 2,
    startsAt: "2026-05-27T12:30:00Z",
    endsAt: "2026-05-28T16:48:00Z",
    intervalMinutes: 45,
    pauseEvery: 5,
    pauseMinutes: 27,
  },
];

const generateRuntimeEvents = (series: DemoRuntimeEventSeries): DemoRuntimeEvent[] => {
  const events: DemoRuntimeEvent[] = [];
  let timestampMs = Date.parse(series.startsAt);
  const endMs = Date.parse(series.endsAt);
  let index = 0;

  while (timestampMs <= endMs) {
    events.push({
      id: `${series.deviceToken}:${index}`,
      deviceToken: series.deviceToken,
      siteId: series.siteId,
      camId: series.camId,
      event: index % 2 === 0 ? "entry" : "exit",
      timestamp: new Date(timestampMs).toISOString(),
    });

    index += 1;
    timestampMs += series.intervalMinutes * MINUTE_IN_MS;
    if (index % series.pauseEvery === 0) {
      timestampMs += series.pauseMinutes * MINUTE_IN_MS;
    }
  }

  return events;
};

export const DEMO_RUNTIME_EVENTS: DemoRuntimeEvent[] = DEMO_RUNTIME_EVENT_SERIES.flatMap(
  generateRuntimeEvents,
);

export const countDemoRuntimeEvents = (deviceTokens: DemoEventToken[]): number => {
  const tokenSet = new Set(deviceTokens);
  return DEMO_RUNTIME_EVENTS.reduce(
    (total, event) => total + (tokenSet.has(event.deviceToken) ? 1 : 0),
    0,
  );
};
