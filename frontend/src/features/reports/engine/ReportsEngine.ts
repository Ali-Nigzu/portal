import type {
  Period,
  Rollup,
  SelectedSnapshot,
} from "../../organisation-dashboard/types";
import { buildSiteFlowBucketLabels } from "../../../lib/siteFlowBuckets";
import { startOfYear } from "../../../lib/timeWindows";
import {
  AGE_BUCKET_LABELS,
  formatReportDateRange,
  type ReportTimeframe,
} from "../utils/reportUtils";

export type ReportType = "site-activity" | "visitor-profile";
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
  snapshot: SelectedSnapshot;
  snapshotTs: Date;
  subtitle: string;
  timeframe: ReportTimeframe;
  bucketLabels: string[];
  metrics: SiteActivityMetrics;
}
export interface VisitorProfileMetrics {
  agePct: number[];
  sexPct: number[];
  totalEntrances: number;
  dominantAgeBucket: string;
  sexSplit: { Male: number; Female: number };
}
export interface VisitorProfileReportData {
  reportType: "visitor-profile";
  snapshot: SelectedSnapshot;
  snapshotTs: Date;
  subtitle: string;
  timeframe: ReportTimeframe;
  metrics: VisitorProfileMetrics;
}
export type ReportData = SiteActivityReportData | VisitorProfileReportData;

const PERIOD_MAP: Record<ReportTimeframe, Period> = {
  today: "today",
  yesterday: "yesterday",
  last_week: "week",
  last_month: "month",
  last_quarter: "quarter",
  last_year: "year",
  all_time: "all_time",
};
const sum = (v: number[]) => v.reduce((a, n) => a + n, 0);
const mean = (v: number[]) => (v.length ? sum(v) / v.length : 0);
const min = (v: number[]) => (v.length ? Math.min(...v) : 0);
const max = (v: number[]) => (v.length ? Math.max(...v) : 0);
const indexOfMax = (v: number[]) => (v.length ? v.indexOf(max(v)) : 0);
const finite = (value: unknown, label: string): number[] => {
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== "number" || !Number.isFinite(v))
  )
    throw new Error(`Snapshot data is invalid: ${label}.`);
  return value;
};
const percent = (value: unknown, length: number, label: string) => {
  const result = finite(value, label);
  const total = sum(result);
  if (result.length !== length || (total !== 0 && total !== 100))
    throw new Error(`Snapshot data is invalid: ${label}.`);
  return result;
};
const timestamp = (value: string) => {
  const result = new Date(value);
  if (!Number.isFinite(result.valueOf()))
    throw new Error("Snapshot timestamp is invalid.");
  return result;
};
export function validateCanonicalSnapshot(snapshot: SelectedSnapshot): void {
  const p = snapshot.payload;
  if (
    !snapshot ||
    !["site", "organisation"].includes(snapshot.scope) ||
    !p ||
    typeof p !== "object"
  )
    throw new Error("Snapshot data is invalid.");
  ["entrances_96", "exits_96", "footfall_96", "dwell_time_96"].forEach(
    (key) => {
      if (finite(p[key as keyof typeof p], key).length !== 96)
        throw new Error(`Snapshot data is invalid: ${key}.`);
    },
  );
  if (!Array.isArray(p.occupancy_96) || p.occupancy_96.length !== 96)
    throw new Error("Snapshot data is invalid: occupancy_96.");
  Object.values(PERIOD_MAP).forEach((period) => parseRollup(p[period], period));
  timestamp(snapshot.ts);
}
function parseRollup(value: Rollup, label: string) {
  if (!value || typeof value !== "object")
    throw new Error(`Snapshot data is invalid: ${label}.`);
  const entrances = finite(value.entrances, `${label}.entrances`);
  const exits = finite(value.exits, `${label}.exits`);
  if (!Array.isArray(value.occupancy))
    throw new Error(`Snapshot data is invalid: ${label}.occupancy.`);
  const occupancyAvg: number[] = [];
  const occupancyMin: number[] = [];
  const occupancyMax: number[] = [];
  value.occupancy.forEach((bucket, i) => {
    if (
      !Array.isArray(bucket) ||
      bucket.length < 3 ||
      bucket.some((v) => typeof v !== "number" || !Number.isFinite(v))
    )
      throw new Error(`Snapshot data is invalid: ${label}.occupancy[${i}].`);
    const [avg, low, high] = bucket;
    if (!(avg === 0 && low === 0 && high === 0) && !(low <= avg && avg <= high))
      throw new Error(`Snapshot data is invalid: ${label}.occupancy[${i}].`);
    occupancyAvg.push(avg);
    occupancyMin.push(low);
    occupancyMax.push(high);
  });
  return {
    entrances,
    exits,
    occupancyAvg,
    occupancyMin,
    occupancyMax,
    agePct: percent(value.age_pct, 6, `${label}.age_pct`),
    sexPct: percent(value.sex_pct, 2, `${label}.sex_pct`),
  };
}
const aggregateDwell = (values: number[], length: number) =>
  Array.from({ length }, (_, i) => {
    const from = Math.floor((i * values.length) / length),
      to = Math.max(Math.floor(((i + 1) * values.length) / length), from + 1);
    const bucket = values.slice(from, to),
      active = bucket.filter((v) => v > 0);
    return Math.round(mean(active.length ? active : bucket));
  });
const frame = (timeframe: ReportTimeframe, ts: Date, series: number[][]) => {
  const data = buildSiteFlowBucketLabels(timeframe, ts, series);
  return {
    labels:
      timeframe === "all_time"
        ? data.timestamps.map((d) => String(d.getFullYear()))
        : data.labels,
    count: data.sliceCount,
  };
};
const normalize = (v: number[], count: number, timeframe: ReportTimeframe) => {
  const selected = timeframe === "today" ? v.slice(-count) : v.slice(0, count);
  return [...selected, ...Array(Math.max(0, count - selected.length)).fill(0)];
};
const subtitle = (
  timeframe: ReportTimeframe,
  ts: Date,
  series: number[][],
  now: Date,
) => {
  let start: Date | undefined;
  if (timeframe === "all_time") {
    const length = Math.max(...series.map((s) => s.length), 0);
    start = length
      ? new Date(ts.getFullYear(), ts.getMonth() - (length - 1), 1)
      : startOfYear(ts);
  }
  return formatReportDateRange(ts, timeframe, now, start).subtitle;
};
export function buildSiteActivityReportData(
  snapshot: SelectedSnapshot,
  timeframe: ReportTimeframe,
  now = new Date(),
): SiteActivityReportData {
  validateCanonicalSnapshot(snapshot);
  const ts = timestamp(snapshot.ts);
  const raw = parseRollup(snapshot.payload[PERIOD_MAP[timeframe]], timeframe);
  const rawFoot = raw.entrances.map((v, i) => v + (raw.exits[i] ?? 0));
  const rawDwell = aggregateDwell(
    finite(snapshot.payload.dwell_time_96, "dwell_time_96"),
    Math.max(raw.entrances.length, raw.exits.length, raw.occupancyAvg.length),
  );
  const f = frame(timeframe, ts, [
    raw.entrances,
    raw.exits,
    rawFoot,
    raw.occupancyAvg,
    rawDwell,
  ]);
  const entrances = normalize(raw.entrances, f.count, timeframe),
    exits = normalize(raw.exits, f.count, timeframe),
    occupancy = normalize(raw.occupancyAvg, f.count, timeframe),
    dwell = normalize(rawDwell, f.count, timeframe),
    footfall = entrances.map((v, i) => v + (exits[i] ?? 0));
  return {
    reportType: "site-activity",
    snapshot,
    snapshotTs: ts,
    timeframe,
    subtitle: subtitle(
      timeframe,
      ts,
      [entrances, exits, occupancy, dwell],
      now,
    ),
    bucketLabels: f.labels,
    metrics: {
      entrancesSeries: entrances,
      exitsSeries: exits,
      footfallSeries: footfall,
      occupancySeries: occupancy,
      dwellSeries: dwell,
      totalEntrances: sum(entrances),
      totalExits: sum(exits),
      netFlow: sum(entrances) - sum(exits),
      peakEntrancesBucket: indexOfMax(entrances),
      peakExitsBucket: indexOfMax(exits),
      peakDwellBucket: indexOfMax(dwell),
      peakOccupancyBucket: indexOfMax(occupancy),
      occupancyMin: min(raw.occupancyMin),
      occupancyMax: max(raw.occupancyMax),
      occupancyAvg: Math.round(mean(occupancy)),
      dwellAvg: Math.round(mean(dwell)),
      dwellMax: max(dwell),
    },
  };
}
export function buildVisitorProfileReportData(
  snapshot: SelectedSnapshot,
  timeframe: ReportTimeframe,
  now = new Date(),
): VisitorProfileReportData {
  validateCanonicalSnapshot(snapshot);
  const ts = timestamp(snapshot.ts);
  const rollup = parseRollup(
    snapshot.payload[PERIOD_MAP[timeframe]],
    timeframe,
  );
  const dominant = rollup.agePct.indexOf(max(rollup.agePct));
  return {
    reportType: "visitor-profile",
    snapshot,
    snapshotTs: ts,
    timeframe,
    subtitle: subtitle(timeframe, ts, [rollup.agePct, rollup.sexPct], now),
    metrics: {
      agePct: rollup.agePct,
      sexPct: rollup.sexPct,
      totalEntrances: sum(rollup.entrances),
      dominantAgeBucket: AGE_BUCKET_LABELS[dominant] ?? AGE_BUCKET_LABELS[0],
      sexSplit: { Male: rollup.sexPct[0] ?? 0, Female: rollup.sexPct[1] ?? 0 },
    },
  };
}
export function buildReportData(
  snapshot: SelectedSnapshot,
  type: ReportType,
  timeframe: ReportTimeframe,
  now = new Date(),
): ReportData {
  return type === "visitor-profile"
    ? buildVisitorProfileReportData(snapshot, timeframe, now)
    : buildSiteActivityReportData(snapshot, timeframe, now);
}
