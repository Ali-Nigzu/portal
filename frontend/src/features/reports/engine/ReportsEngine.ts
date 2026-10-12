import { rollingBucketTimes, dayBucketTimes } from "../../organisation-dashboard/snapshotTime";
import { type SelectedSnapshot, type Period, type Rollup } from "../../organisation-dashboard/types";
import { type ReportTimeframe, buildSiteFlowBucketLabels, startOfYear, AGE_BUCKET_LABELS, formatReportDateRange } from "../utils/reportUtils";

export type ReportType = "site-activity" | "visitor-profile";
interface SiteActivityMetrics {
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
  peakDwellBucket: number | null;
  peakOccupancyBucket: number;
  occupancyMin: number;
  occupancyMax: number;
  occupancyAvg: number;
  dwellAvg: number | null;
  dwellMax: number | null;
}
interface SiteActivityReportData {
  reportType: "site-activity";
  snapshot: SelectedSnapshot;
  snapshotTs: Date;
  subtitle: string;
  timeframe: ReportTimeframe;
  bucketLabels: string[];
  metrics: SiteActivityMetrics;
}
interface VisitorProfileMetrics {
  agePct: number[];
  sexPct: number[];
  totalEntrances: number;
  dominantAgeBucket: string | null;
  sexSplit: { Male: number; Female: number };
}
interface VisitorProfileReportData {
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
function validateSnapshot(snapshot: SelectedSnapshot, selected?: Period) {
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
  let rollup: ReturnType<typeof parseRollup> | undefined;
  Object.values(PERIOD_MAP).forEach((period) => {
    const parsed = parseRollup(p[period], period);
    if (period === selected) rollup = parsed;
  });
  return { ts: timestamp(snapshot.ts), rollup };
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
function currentDayDwell(values: number[], ts: Date, count: number): number[] {
  const times = rollingBucketTimes(ts.toISOString());
  const start = dayBucketTimes(ts.toISOString(), 1)[0];
  return Array.from({ length: count }, (_, hour) => {
    const buckets = values.filter((_, i) => times[i] >= start + hour * 3600000 && times[i] < start + (hour + 1) * 3600000);
    const active = buckets.filter(value => value > 0);
    return Math.round(mean(active.length ? active : buckets));
  });
}
const frame = (timeframe: ReportTimeframe, ts: Date, series: number[][]) => {
  const data = buildSiteFlowBucketLabels(timeframe, ts, series);
  return {
    labels:
      timeframe === "all_time"
        ? data.timestamps.map((d) => String(d.getUTCFullYear()))
        : data.labels,
    count: data.sliceCount,
  };
};
const normalize = (v: number[], count: number) => {
  const selected = v.slice(0, count);
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
      ? new Date(Date.UTC(ts.getUTCFullYear() - length + 1, 0, 1))
      : startOfYear(ts);
  }
  return formatReportDateRange(ts, timeframe, now, start).subtitle;
};
function buildSiteActivityReportData(
  snapshot: SelectedSnapshot,
  timeframe: ReportTimeframe,
  now = new Date(),
): SiteActivityReportData {
  const { ts, rollup } = validateSnapshot(snapshot, PERIOD_MAP[timeframe]);
  const raw = rollup ?? parseRollup(snapshot.payload[PERIOD_MAP[timeframe]], timeframe);
  const rawFoot = raw.entrances.map((v, i) => v + (raw.exits[i] ?? 0));
  const f = frame(timeframe, ts, [raw.entrances, raw.exits, rawFoot, raw.occupancyAvg]);
  // The repository owns only rolling dwell. Historical periods must not rebin
  // the latest 24 hours into fictional month/year history.
  const dwell = timeframe === "today" ? currentDayDwell(snapshot.payload.dwell_time_96, ts, f.count) : [];
  const entrances = normalize(raw.entrances, f.count),
    exits = normalize(raw.exits, f.count),
    occupancy = raw.occupancyAvg.slice(0, f.count),
    footfall = entrances.map((v, i) => v + (exits[i] ?? 0));
  return {
    reportType: "site-activity",
    snapshot,
    snapshotTs: ts,
    timeframe,
    subtitle: subtitle(
      timeframe,
      ts,
      [snapshot.payload.all_time.entrances],
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
      peakDwellBucket: dwell.length ? indexOfMax(dwell) : null,
      peakOccupancyBucket: indexOfMax(occupancy),
      occupancyMin: min(raw.occupancyMin.slice(0, f.count)),
      occupancyMax: max(raw.occupancyMax.slice(0, f.count)),
      occupancyAvg: Math.round(mean(occupancy)),
      dwellAvg: dwell.length ? Math.round(mean(dwell)) : null,
      dwellMax: dwell.length ? max(dwell) : null,
    },
  };
}
function buildVisitorProfileReportData(
  snapshot: SelectedSnapshot,
  timeframe: ReportTimeframe,
  now = new Date(),
): VisitorProfileReportData {
  const { ts, rollup: selected } = validateSnapshot(snapshot, PERIOD_MAP[timeframe]);
  const rollup = selected ?? parseRollup(
    snapshot.payload[PERIOD_MAP[timeframe]],
    timeframe,
  );
  const dominant = rollup.agePct.indexOf(max(rollup.agePct));
  return {
    reportType: "visitor-profile",
    snapshot,
    snapshotTs: ts,
    timeframe,
    subtitle: subtitle(timeframe, ts, [snapshot.payload.all_time.entrances], now),
    metrics: {
      agePct: rollup.agePct,
      sexPct: rollup.sexPct,
      totalEntrances: sum(normalize(rollup.entrances, frame(timeframe, ts, [rollup.entrances]).count)),
      dominantAgeBucket: sum(rollup.agePct) > 0 ? AGE_BUCKET_LABELS[dominant] : null,
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
