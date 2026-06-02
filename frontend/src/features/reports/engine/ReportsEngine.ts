import { API_BASE_URL } from "../../../config";
import type { Credentials } from "../../../types/credentials";
import { isDemoSessionActive } from "../../../lib/demoSession";
import { determineOrgId } from "../../../lib/org";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import type { SnapshotResponse } from "../../../lib/snapshots";
import { buildSiteFlowBucketLabels } from "../../../lib/siteFlowBuckets";
import {
  resolveSiteViewFromPathname,
  type SiteView,
} from "../../../lib/siteView";
import { startOfYear } from "../../../lib/timeWindows";
import {
  AGE_BUCKET_LABELS,
  RACE_BUCKET_LABELS,
  SEX_BUCKET_LABELS,
  formatReportDateRange,
  type ReportTimeframe,
} from "../utils/reportUtils";

export type ReportType = "site-activity" | "visitor-profile";

const SNAPSHOT_SLOT = {
  entrances96: 0,
  occupancy96: 1,
  exits96: 2,
  footfall96: 3,
  dwellTime96: 4,
  trafficSplit: 5,
  capacity: 6,
  today: 7,
  yesterday: 8,
  week: 9,
  month: 10,
  quarter: 11,
  year: 12,
  allTime: 13,
} as const;

const ROLLUP_SLOT = {
  entrances: 0,
  occupancy: 1,
  exits: 2,
  agePct: 3,
  sexPct: 4,
  racePct: 5,
} as const;

const TIMEFRAME_TO_SCHEMA_SLOT: Record<ReportTimeframe, number> = {
  today: SNAPSHOT_SLOT.today,
  yesterday: SNAPSHOT_SLOT.yesterday,
  last_week: SNAPSHOT_SLOT.week,
  last_month: SNAPSHOT_SLOT.month,
  last_quarter: SNAPSHOT_SLOT.quarter,
  last_year: SNAPSHOT_SLOT.year,
  all_time: SNAPSHOT_SLOT.allTime,
};

const REQUIRED_SCHEMA_PAYLOAD_LENGTH = 14;
const FIFTEEN_MINUTE_BUCKETS_PER_DAY = 96;

type FetchLike = typeof fetch;

interface ReportsSnapshotResponse extends SnapshotResponse {
  orgId?: string;
  siteView?: SiteView;
  fallback?: boolean;
}

interface SchemaRollup {
  entrances: number[];
  occupancyAvg: number[];
  occupancyMin: number[];
  occupancyMax: number[];
  exits: number[];
  agePct: number[];
  sexPct: number[];
  racePct: number[];
}

export interface SiteActivityMetrics {
  entrancesSeries: number[];
  exitsSeries: number[];
  footfallSeries: number[];
  occupancySeries: number[];
  dwellSeries: number[];
  totalEntrances: number;
  totalExits: number;
  netFlow: number;
  peakEntrancesBucket: number;
  peakExitsBucket: number;
  peakDwellBucket: number;
  peakOccupancyBucket: number;
  occupancyMin: number;
  occupancyMax: number;
  occupancyAvg: number;
  dwellAvg: number;
  dwellMax: number;
}

export interface SiteActivityReportData {
  reportType: "site-activity";
  siteView: SiteView;
  snapshot: ReportsSnapshotResponse;
  snapshotTs: Date;
  subtitle: string;
  timeframe: ReportTimeframe;
  bucketLabels: string[];
  metrics: SiteActivityMetrics;
}

export interface VisitorProfileMetrics {
  agePct: number[];
  sexPct: number[];
  racePct: number[];
  totalEntrances: number;
  dominantAgeBucket: string;
  sexSplit: { Male: number; Female: number };
  raceSplit: { Light: number; Mix: number; Dark: number };
}

export interface VisitorProfileReportData {
  reportType: "visitor-profile";
  siteView: SiteView;
  snapshot: ReportsSnapshotResponse;
  snapshotTs: Date;
  subtitle: string;
  timeframe: ReportTimeframe;
  metrics: VisitorProfileMetrics;
}

export type ReportData = SiteActivityReportData | VisitorProfileReportData;

export interface LoadReportDataOptions {
  reportType: ReportType;
  timeframe: ReportTimeframe;
  pathname?: string;
  fetchFn?: FetchLike;
  now?: Date;
  credentials?: Credentials;
}

const toNumberArray = (value: unknown, label: string): number[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Schema validation failed: ${label} must be an array.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new Error(
        `Schema validation failed: ${label}[${index}] must be a finite number.`,
      );
    }
    return item;
  });
};

const sum = (values: number[]): number =>
  values.reduce((acc, value) => acc + value, 0);

const mean = (values: number[]): number =>
  values.length ? sum(values) / values.length : 0;

const min = (values: number[]): number =>
  values.length ? Math.min(...values) : 0;

const max = (values: number[]): number =>
  values.length ? Math.max(...values) : 0;

const indexOfMax = (values: number[]): number =>
  values.length ? values.indexOf(max(values)) : 0;

const parseSnapshotTimestamp = (value: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Snapshot timestamp is invalid: ${value}`);
  }
  return parsed;
};

export const resolveReportSiteView = (pathname?: string): SiteView => {
  const resolvedPathname =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : null);
  const siteView = resolveSiteViewFromPathname(resolvedPathname);
  if (!siteView) {
    throw new Error("Missing site context");
  }
  return siteView;
};

const buildSnapshotRequest = (
  siteView: SiteView,
  credentials?: Credentials,
): { url: string; headers: HeadersInit } => {
  const params = new URLSearchParams();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const viewToken =
    typeof window === "undefined" ? undefined : getViewTokenFromLocation();
  const isDemoSession = isDemoSessionActive();
  params.set("siteView", siteView);
  params.set("strictSiteView", "1");
  if (viewToken) {
    params.set("viewToken", viewToken);
  } else if (!isDemoSession && credentials) {
    params.set("org", determineOrgId(credentials));
    if (!credentials.username || !credentials.password) {
      throw new Error("Missing credentials for snapshot lookup.");
    }
    headers.Authorization = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  } else if (!isDemoSession) {
    throw new Error("Missing view_token or credentials for snapshot lookup.");
  }
  return {
    url: `${API_BASE_URL}/api/snapshots/latest?${params.toString()}`,
    headers,
  };
};

export const buildReportsSnapshotUrl = (
  siteView: SiteView,
  credentials?: Credentials,
): string => buildSnapshotRequest(siteView, credentials).url;

export const loadReportSnapshot = async ({
  siteView,
  fetchFn = fetch,
  credentials,
}: {
  siteView: SiteView;
  fetchFn?: FetchLike;
  credentials?: Credentials;
}): Promise<ReportsSnapshotResponse> => {
  if (!siteView) {
    throw new Error("Missing site context");
  }
  const request = buildSnapshotRequest(siteView, credentials);
  const response = await fetchFn(request.url, {
    headers: request.headers,
    credentials: isDemoSessionActive() ? "include" : "same-origin",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Snapshot fetch failed: ${response.status} ${text}`);
  }
  const snapshot = (await response.json()) as ReportsSnapshotResponse;
  validateSnapshotResponse(snapshot, siteView);
  return snapshot;
};

export const validateSnapshotResponse = (
  snapshot: ReportsSnapshotResponse,
  requestedSiteView: SiteView,
): void => {
  if (snapshot.siteView !== requestedSiteView) {
    throw new Error(
      `Snapshot site mismatch: requested ${requestedSiteView}, received ${snapshot.siteView ?? "unknown"}.`,
    );
  }
  if (snapshot.fallback !== false) {
    throw new Error("Snapshot fallback responses are not allowed for reports.");
  }
  validateSchemaPayload(snapshot.payload);
};

const validatePercentVector = (
  values: number[],
  expectedLength: number,
  label: string,
): void => {
  if (values.length !== expectedLength) {
    throw new Error(
      `Schema validation failed: ${label} must have ${expectedLength} values.`,
    );
  }
  const total = sum(values);
  const allZero = values.every((value) => value === 0);
  if (!allZero && total !== 100) {
    throw new Error(
      `Schema validation failed: ${label} must sum to 100 or be all zero.`,
    );
  }
};

export const validateSchemaPayload = (payload: unknown[]): void => {
  if (
    !Array.isArray(payload) ||
    payload.length < REQUIRED_SCHEMA_PAYLOAD_LENGTH
  ) {
    throw new Error(
      "Schema validation failed: snapshot payload must contain 14 slots.",
    );
  }
  [
    [SNAPSHOT_SLOT.entrances96, "entrances_96"],
    [SNAPSHOT_SLOT.occupancy96, "occupancy_96"],
    [SNAPSHOT_SLOT.exits96, "exits_96"],
    [SNAPSHOT_SLOT.footfall96, "footfall_96"],
    [SNAPSHOT_SLOT.dwellTime96, "dwell_time_96"],
  ].forEach(([slot, label]) => {
    const values = toNumberArray(payload[slot as number], label as string);
    if (values.length !== FIFTEEN_MINUTE_BUCKETS_PER_DAY) {
      throw new Error(
        `Schema validation failed: ${label} must contain 96 buckets.`,
      );
    }
  });
  const entrances96 = toNumberArray(
    payload[SNAPSHOT_SLOT.entrances96],
    "entrances_96",
  );
  const exits96 = toNumberArray(payload[SNAPSHOT_SLOT.exits96], "exits_96");
  const footfall96 = toNumberArray(
    payload[SNAPSHOT_SLOT.footfall96],
    "footfall_96",
  );
  footfall96.forEach((value, index) => {
    if (value !== (entrances96[index] ?? 0) + (exits96[index] ?? 0)) {
      throw new Error(
        `Schema validation failed: footfall_96[${index}] must equal entrances_96 + exits_96.`,
      );
    }
  });
  (
    [
      ["today", TIMEFRAME_TO_SCHEMA_SLOT.today],
      ["yesterday", TIMEFRAME_TO_SCHEMA_SLOT.yesterday],
      ["last_week", TIMEFRAME_TO_SCHEMA_SLOT.last_week],
      ["last_month", TIMEFRAME_TO_SCHEMA_SLOT.last_month],
      ["last_quarter", TIMEFRAME_TO_SCHEMA_SLOT.last_quarter],
      ["last_year", TIMEFRAME_TO_SCHEMA_SLOT.last_year],
      ["all_time", TIMEFRAME_TO_SCHEMA_SLOT.all_time],
    ] as Array<[ReportTimeframe, number]>
  ).forEach(([timeframe, slot]) => {
    parseSchemaRollup(payload[slot], timeframe);
  });
};

const parseSchemaRollup = (value: unknown, label: string): SchemaRollup => {
  if (!Array.isArray(value) || value.length < 6) {
    throw new Error(
      `Schema validation failed: ${label} rollup must contain 6 slots.`,
    );
  }
  const entrances = toNumberArray(
    value[ROLLUP_SLOT.entrances],
    `${label}.entrances`,
  );
  const exits = toNumberArray(value[ROLLUP_SLOT.exits], `${label}.exits`);
  const occupancyRaw = value[ROLLUP_SLOT.occupancy];
  if (!Array.isArray(occupancyRaw)) {
    throw new Error(
      `Schema validation failed: ${label}.occupancy must be an array.`,
    );
  }
  const occupancyAvg: number[] = [];
  const occupancyMin: number[] = [];
  const occupancyMax: number[] = [];
  occupancyRaw.forEach((bucket, index) => {
    if (!Array.isArray(bucket) || bucket.length < 3) {
      throw new Error(
        `Schema validation failed: ${label}.occupancy[${index}] must be [avg,min,max].`,
      );
    }
    const [avg, minValue, maxValue] = bucket;
    if (
      typeof avg !== "number" ||
      typeof minValue !== "number" ||
      typeof maxValue !== "number" ||
      !Number.isFinite(avg) ||
      !Number.isFinite(minValue) ||
      !Number.isFinite(maxValue)
    ) {
      throw new Error(
        `Schema validation failed: ${label}.occupancy[${index}] values must be finite numbers.`,
      );
    }
    if (
      !(avg === 0 && minValue === 0 && maxValue === 0) &&
      !(minValue <= avg && avg <= maxValue)
    ) {
      throw new Error(
        `Schema validation failed: ${label}.occupancy[${index}] must satisfy min <= avg <= max.`,
      );
    }
    occupancyAvg.push(avg);
    occupancyMin.push(minValue);
    occupancyMax.push(maxValue);
  });
  const agePct = toNumberArray(value[ROLLUP_SLOT.agePct], `${label}.age_pct`);
  const sexPct = toNumberArray(value[ROLLUP_SLOT.sexPct], `${label}.sex_pct`);
  const racePct = toNumberArray(
    value[ROLLUP_SLOT.racePct],
    `${label}.race_pct`,
  );
  validatePercentVector(agePct, 6, `${label}.age_pct`);
  validatePercentVector(sexPct, 2, `${label}.sex_pct`);
  validatePercentVector(racePct, 3, `${label}.race_pct`);
  return {
    entrances,
    occupancyAvg,
    occupancyMin,
    occupancyMax,
    exits,
    agePct,
    sexPct,
    racePct,
  };
};

const selectSchemaRollup = (
  payload: unknown[],
  timeframe: ReportTimeframe,
): SchemaRollup =>
  parseSchemaRollup(payload[TIMEFRAME_TO_SCHEMA_SLOT[timeframe]], timeframe);

const aggregateDwellFromDwell96 = (
  dwell96: number[],
  targetLength: number,
): number[] => {
  if (targetLength <= 0) {
    return [];
  }
  return Array.from({ length: targetLength }, (_, index) => {
    const start = Math.floor((index * dwell96.length) / targetLength);
    const end = Math.floor(((index + 1) * dwell96.length) / targetLength);
    const bucket = dwell96.slice(start, Math.max(end, start + 1));
    const activeValues = bucket.filter((value) => value > 0);
    const source = activeValues.length ? activeValues : bucket;
    return Math.round(mean(source));
  });
};

const inferAllTimeStart = (end: Date, seriesList: number[][]): Date => {
  const maxLength = Math.max(...seriesList.map((series) => series.length), 0);
  if (maxLength <= 0) {
    return startOfYear(end);
  }
  const endMonthStart = new Date(
    end.getFullYear(),
    end.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  return new Date(
    endMonthStart.getFullYear(),
    endMonthStart.getMonth() - (maxLength - 1),
    1,
    0,
    0,
    0,
    0,
  );
};

const buildBucketLabels = (
  timeframe: ReportTimeframe,
  snapshotTs: Date,
  seriesList: number[][],
): string[] => {
  const bucketLabelData = buildSiteFlowBucketLabels(
    timeframe,
    snapshotTs,
    seriesList,
  );
  if (timeframe === "all_time") {
    return bucketLabelData.timestamps.map((timestamp) =>
      String(timestamp.getFullYear()),
    );
  }
  return bucketLabelData.labels;
};

export const buildSiteActivityReportData = ({
  snapshot,
  siteView,
  timeframe,
  now = new Date(),
}: {
  snapshot: ReportsSnapshotResponse;
  siteView: SiteView;
  timeframe: ReportTimeframe;
  now?: Date;
}): SiteActivityReportData => {
  const snapshotTs = parseSnapshotTimestamp(snapshot.ts);
  const rollup = selectSchemaRollup(snapshot.payload, timeframe);
  const dwell96 = toNumberArray(
    snapshot.payload[SNAPSHOT_SLOT.dwellTime96],
    "dwell_time_96",
  );
  const targetLength = Math.max(
    rollup.entrances.length,
    rollup.exits.length,
    rollup.occupancyAvg.length,
  );
  const dwellSeries = aggregateDwellFromDwell96(dwell96, targetLength);
  const footfallSeries = Array.from(
    { length: Math.max(rollup.entrances.length, rollup.exits.length) },
    (_, index) => (rollup.entrances[index] ?? 0) + (rollup.exits[index] ?? 0),
  );
  const headerEnd = snapshotTs.getTime() <= now.getTime() ? snapshotTs : now;
  const headerStartOverride =
    timeframe === "all_time"
      ? inferAllTimeStart(headerEnd, [
          rollup.entrances,
          rollup.exits,
          footfallSeries,
          rollup.occupancyAvg,
          dwellSeries,
        ])
      : undefined;
  const { subtitle } = formatReportDateRange(
    snapshotTs,
    timeframe,
    now,
    headerStartOverride,
  );
  const bucketLabels = buildBucketLabels(timeframe, snapshotTs, [
    rollup.entrances,
    rollup.exits,
    footfallSeries,
    rollup.occupancyAvg,
    dwellSeries,
  ]);
  const metrics: SiteActivityMetrics = {
    entrancesSeries: rollup.entrances,
    exitsSeries: rollup.exits,
    footfallSeries,
    occupancySeries: rollup.occupancyAvg,
    dwellSeries,
    totalEntrances: sum(rollup.entrances),
    totalExits: sum(rollup.exits),
    netFlow: sum(rollup.entrances) - sum(rollup.exits),
    peakEntrancesBucket: indexOfMax(rollup.entrances),
    peakExitsBucket: indexOfMax(rollup.exits),
    peakDwellBucket: indexOfMax(dwellSeries),
    peakOccupancyBucket: indexOfMax(rollup.occupancyAvg),
    occupancyMin: min(rollup.occupancyMin),
    occupancyMax: max(rollup.occupancyAvg),
    occupancyAvg: rollup.occupancyAvg.length
      ? Math.round(mean(rollup.occupancyAvg))
      : 0,
    dwellAvg: dwellSeries.length ? Math.round(mean(dwellSeries)) : 0,
    dwellMax: max(dwellSeries),
  };
  return {
    reportType: "site-activity",
    siteView,
    snapshot,
    snapshotTs,
    subtitle,
    timeframe,
    bucketLabels,
    metrics,
  };
};

export const buildVisitorProfileReportData = ({
  snapshot,
  siteView,
  timeframe,
  now = new Date(),
}: {
  snapshot: ReportsSnapshotResponse;
  siteView: SiteView;
  timeframe: ReportTimeframe;
  now?: Date;
}): VisitorProfileReportData => {
  const snapshotTs = parseSnapshotTimestamp(snapshot.ts);
  const rollup = selectSchemaRollup(snapshot.payload, timeframe);
  const headerStartOverride =
    timeframe === "all_time"
      ? inferAllTimeStart(snapshotTs, [
          rollup.agePct,
          rollup.sexPct,
          rollup.racePct,
        ])
      : undefined;
  const { subtitle } = formatReportDateRange(
    snapshotTs,
    timeframe,
    now,
    headerStartOverride,
  );
  const dominantAgeIndex = rollup.agePct.length
    ? rollup.agePct.indexOf(max(rollup.agePct))
    : 0;
  const metrics: VisitorProfileMetrics = {
    agePct: rollup.agePct,
    sexPct: rollup.sexPct,
    racePct: rollup.racePct,
    totalEntrances: sum(rollup.entrances),
    dominantAgeBucket:
      AGE_BUCKET_LABELS[dominantAgeIndex] ?? AGE_BUCKET_LABELS[0],
    sexSplit: { Male: rollup.sexPct[0] ?? 0, Female: rollup.sexPct[1] ?? 0 },
    raceSplit: {
      Light: rollup.racePct[0] ?? 0,
      Mix: rollup.racePct[1] ?? 0,
      Dark: rollup.racePct[2] ?? 0,
    },
  };
  return {
    reportType: "visitor-profile",
    siteView,
    snapshot,
    snapshotTs,
    subtitle,
    timeframe,
    metrics,
  };
};

export const loadReportData = async ({
  reportType,
  timeframe,
  pathname,
  fetchFn,
  now,
  credentials,
}: LoadReportDataOptions): Promise<ReportData> => {
  const siteView = resolveReportSiteView(pathname);
  const snapshot = await loadReportSnapshot({ siteView, fetchFn, credentials });
  if (reportType === "visitor-profile") {
    return buildVisitorProfileReportData({
      snapshot,
      siteView,
      timeframe,
      now,
    });
  }
  return buildSiteActivityReportData({ snapshot, siteView, timeframe, now });
};

export const snapshotPayloadHash = (
  snapshot: Pick<ReportsSnapshotResponse, "ts" | "payload" | "siteView">,
): string =>
  JSON.stringify({
    ts: snapshot.ts,
    siteView: snapshot.siteView,
    payload: snapshot.payload,
  });
