import type {
  ChartResult,
  ChartSeries,
  DataPoint,
} from "../../../analytics/schemas/charting";
import type { SnapshotResponse } from "../../../lib/snapshots";
import { buildSiteFlowBucketLabels } from "../../../lib/siteFlowBuckets";
import type { SiteFlowTimeframe } from "../../../lib/siteFlowTimeframe";
import type { SiteView } from "../../../lib/siteView";
import {
  getDemoTrafficLabels,
  getExpectedDemoTrafficLabels,
} from "../../../lib/demoLabels";
import { VRM_KPI_IDS, VRM_KPI_TITLES } from "./applyVRMOverrides";
import { formatDemoTimestamp, parseDemoTimestamp } from "../../../lib/demoTime";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEGACY_ROLLUP_INDEX: Record<SiteFlowTimeframe, number> = {
  today: 0,
  yesterday: 1,
  last_week: 2,
  last_month: 3,
  last_quarter: 4,
  last_year: 5,
  all_time: 6,
};

const TARGET_ROLLUP_SLOT: Record<SiteFlowTimeframe, number> = {
  today: 7,
  yesterday: 8,
  last_week: 9,
  last_month: 10,
  last_quarter: 11,
  last_year: 12,
  all_time: 13,
};

interface NormalizedRollup {
  entrances: number[];
  exits: number[];
  occupancyAvg: number[];
  occupancyMin: number[];
  occupancyMax: number[];
  agePct: number[];
  sexPct: number[];
  racePct: number[];
}

interface NormalizedSnapshotPayload {
  entrances96: number[];
  occupancy96: number[];
  exits96: number[];
  footfall96: number[];
  dwell96: number[];
  trafficSplit: number[];
  capacity: number[];
  rollups: Record<SiteFlowTimeframe, NormalizedRollup>;
}

const EMPTY_ROLLUP: NormalizedRollup = {
  entrances: [],
  exits: [],
  occupancyAvg: [],
  occupancyMin: [],
  occupancyMax: [],
  agePct: [],
  sexPct: [],
  racePct: [],
};

const asNumberArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "number" ? item : 0))
    : [];

const toIso = (value: Date): string => formatDemoTimestamp(value);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const parseSnapshotTimestamp = (value: string): Date => {
  const parsed = parseDemoTimestamp(value);
  if (parsed) {
    return parsed;
  }
  throw new Error(`Unparseable demo snapshot timestamp: ${value}`);
};

const buildTimeSeriesPoints = (
  values: number[],
  end: Date,
  stepMs: number,
): DataPoint[] =>
  values.map((value, index) => ({
    x: toIso(new Date(end.getTime() - (values.length - 1 - index) * stepMs)),
    y: value,
    value,
  }));

const floorToQuarterHour = (value: Date): Date => {
  const timestamp = value.getTime();
  const floored =
    Math.floor(timestamp / FIFTEEN_MINUTES_MS) * FIFTEEN_MINUTES_MS;
  return new Date(floored);
};

const normalizeSeriesLength = (values: number[], count: number): number[] => {
  const sliced = values.slice(0, count);
  if (sliced.length >= count) {
    return sliced;
  }
  return [...sliced, ...Array.from({ length: count - sliced.length }, () => 0)];
};

const normalizeSeriesLengthFromTail = (values: number[], count: number): number[] => {
  const sliced = values.slice(-count);
  if (sliced.length >= count) {
    return sliced;
  }
  return [...Array.from({ length: count - sliced.length }, () => 0), ...sliced];
};

const normalizeKpiSeriesLength = (values: number[], count: number): number[] => {
  const sliced = values.slice(0, count);
  if (sliced.length >= count) {
    return sliced;
  }
  return [
    ...Array.from({ length: count - sliced.length }, () => 0),
    ...sliced,
  ];
};

const buildKpiResult = (
  values: number[],
  snapshotTs: Date,
  widgetId: string,
): ChartResult => {
  const end = floorToQuarterHour(snapshotTs);
  const start = new Date(end.getTime() - DAY_MS);
  const bucketCount =
    Math.floor(
      (end.getTime() - start.getTime()) / FIFTEEN_MINUTES_MS,
    ) + 1;
  const normalizedValues = normalizeKpiSeriesLength(values, bucketCount);
  return {
    chartType: "single_value",
    xDimension: {
      id: "timestamp",
      type: "time",
      bucket: "15_MIN",
      timezone: "DEMO_CLOCK",
    },
    series: [
      {
        id: widgetId,
        label: VRM_KPI_TITLES[widgetId] ?? widgetId,
        geometry: "line",
        data: buildTimeSeriesPoints(
          normalizedValues,
          end,
          FIFTEEN_MINUTES_MS,
        ),
      },
    ],
    meta: {
      timezone: "DEMO_CLOCK",
      summary: {
        widgetId,
        title: VRM_KPI_TITLES[widgetId] ?? widgetId,
        presentation: "vrm",
      },
    },
  };
};

const resolveTrafficLabels = (count: number, siteView: SiteView): string[] =>
  getDemoTrafficLabels(siteView, count);

const buildTrafficResult = (values: number[], siteView: SiteView): ChartResult => {
  const expectedLabelCount = getExpectedDemoTrafficLabels(siteView).length;
  const segmentCount = Math.max(values.length, expectedLabelCount);
  const labels = resolveTrafficLabels(segmentCount, siteView);
  const normalized = Array.from({ length: segmentCount }, (_, index) => {
    const value = values[index];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  const data = normalized.map((value, index) => ({
    x: labels[index] ?? `Segment ${index + 1}`,
    y: value,
    value,
  }));
  const series: ChartSeries = {
    id: "traffic_share",
    label: siteView === "all" ? "Traffic by Site" : "Traffic by Camera",
    geometry: "bar",
    unit: "percentage",
    data,
  };
  return {
    chartType: "categorical",
    xDimension: { id: "traffic_segment", type: "category" },
    series: [series],
    meta: {
      timezone: "DEMO_CLOCK",
      summary: {
        presentation: "vrm",
        chartStyle: "traffic_distribution",
        chartSubType: "traffic_distribution",
        traffic_distribution_source: "snapshot_pct",
        title: "Traffic Split",
      },
    },
  };
};

const buildCapacityResult = (values: number[]): ChartResult => {
  const [currentRaw = 0, peakRaw = 0] = values;
  const currentPct = clamp(currentRaw, 0, 100);
  const peakPct = clamp(Math.max(peakRaw, currentRaw), 0, 100);
  return {
    chartType: "categorical",
    xDimension: { id: "capacity_segment", type: "category" },
    series: [
      {
        id: "capacity",
        label: "Capacity usage",
        geometry: "bar",
        unit: "percentage",
        data: [
          { x: "Usage", value: currentPct, y: currentPct },
          { x: "Peak extra", value: peakPct, y: peakPct },
        ],
      },
    ],
    meta: {
      timezone: "DEMO_CLOCK",
      summary: {
        presentation: "vrm",
        chartStyle: "capacity_usage",
        chartSubType: "capacity_usage",
        title: "Capacity",
        headlineValue: currentPct,
        capacity_usage_source: "snapshot_pct",
        capacity_current_pct: currentPct,
        capacity_peak_pct: peakPct,
      },
    },
  };
};

const buildSiteFlowResult = (
  rollup: NormalizedRollup,
  snapshotTs: Date,
  timeframe: SiteFlowTimeframe,
): ChartResult => {
  const { bucket, timestamps, sliceCount } = buildSiteFlowBucketLabels(
    timeframe,
    snapshotTs,
    [
      rollup.entrances,
      rollup.exits,
      rollup.occupancyAvg,
      rollup.occupancyMin,
      rollup.occupancyMax,
    ],
  );
  const normalizeForFrame = timeframe === "today"
    ? normalizeSeriesLengthFromTail
    : normalizeSeriesLength;
  const normalizedEntrances = normalizeForFrame(rollup.entrances, sliceCount);
  const normalizedExits = normalizeForFrame(rollup.exits, sliceCount);
  const normalizedOccAvg = normalizeForFrame(rollup.occupancyAvg, sliceCount);
  const normalizedOccMin = normalizeForFrame(rollup.occupancyMin, sliceCount);
  const normalizedOccMax = normalizeForFrame(rollup.occupancyMax, sliceCount);

  const buildSeries = (id: string, values: number[]): ChartSeries => ({
    id,
    label: id,
    geometry: "line",
    data: timestamps.map((timestamp, index) => ({
      x: toIso(timestamp),
      y: values[index] ?? 0,
      value: values[index] ?? 0,
    })),
  });

  const occupancySeries: ChartSeries = {
    id: "occupancy",
    label: "Occupancy",
    geometry: "line",
    data: timestamps.map((timestamp, index) => ({
      x: toIso(timestamp),
      occupancy_avg: normalizedOccAvg[index] ?? null,
      occupancy_min: normalizedOccMin[index] ?? null,
      occupancy_max: normalizedOccMax[index] ?? null,
      value: normalizedOccAvg[index] ?? null,
      y: normalizedOccAvg[index] ?? null,
    })),
  };

  return {
    chartType: "composed_time",
    xDimension: { id: "timestamp", type: "time", bucket, timezone: "DEMO_CLOCK" },
    series: [
      buildSeries("entrances", normalizedEntrances),
      buildSeries("exits", normalizedExits),
      { ...occupancySeries, data: occupancySeries.data.slice(0, sliceCount) },
    ],
    meta: {
      timezone: "DEMO_CLOCK",
      summary: {
        title: "Site Flow",
        presentation: "vrm",
        siteFlowTimeframe: timeframe,
      },
    },
  };
};

const buildDemographicResult = (
  values: number[],
  kind: "age" | "gender" | "race",
): ChartResult => ({
  chartType: "categorical",
  xDimension: { id: kind, type: "category" },
  series: [
    {
      id: `${kind}_distribution`,
      label: kind,
      geometry: "bar",
      data: values.map((value, index) => ({
        x: String(index),
        y: value,
        value,
      })),
    },
  ],
  meta: { timezone: "DEMO_CLOCK", summary: { title: kind } },
});

const detectPayloadContract = (payload: unknown[]): "target_v2" | "legacy_v1" => {
  const hasTargetShape = payload.length >= 14
    && Array.isArray(payload[7])
    && Array.isArray(payload[8])
    && Array.isArray(payload[9])
    && Array.isArray(payload[10])
    && Array.isArray(payload[11])
    && Array.isArray(payload[12])
    && Array.isArray(payload[13]);
  if (hasTargetShape) {
    return "target_v2";
  }

  const hasLegacyShape = payload.length >= 8
    && Array.isArray(payload[7])
    && (payload[7] as unknown[]).length > 0
    && Array.isArray((payload[7] as unknown[])[0]);
  if (hasLegacyShape) {
    return "legacy_v1";
  }

  throw new Error("Unsupported snapshot payload contract for demo site flow");
};

const normalizeLegacyRollup = (rawRollup: unknown[]): NormalizedRollup => ({
  entrances: asNumberArray(rawRollup?.[0]),
  exits: asNumberArray(rawRollup?.[1]),
  occupancyAvg: asNumberArray(rawRollup?.[2]),
  occupancyMin: asNumberArray(rawRollup?.[3]),
  occupancyMax: asNumberArray(rawRollup?.[4]),
  agePct: asNumberArray(rawRollup?.[5]),
  sexPct: asNumberArray(rawRollup?.[6]),
  racePct: asNumberArray(rawRollup?.[7]),
});

const normalizeTargetRollup = (rawRollup: unknown[]): NormalizedRollup => {
  if (rawRollup.length < 6) {
    throw new Error("Target rollup must contain 6 series slots");
  }
  const occupancyTriplets = Array.isArray(rawRollup?.[1])
    ? (rawRollup[1] as unknown[])
    : [];
  if (!Array.isArray(rawRollup[0]) || !Array.isArray(rawRollup[2])) {
    throw new Error("Target rollup entrances/exits must be arrays");
  }
  if (!Array.isArray(rawRollup[3]) || !Array.isArray(rawRollup[4]) || !Array.isArray(rawRollup[5])) {
    throw new Error("Target rollup demographic slots must be arrays");
  }
  if (occupancyTriplets.some((bucket) => !Array.isArray(bucket) || bucket.length < 3)) {
    throw new Error("Target rollup occupancy series must be triplet arrays");
  }

  return {
    entrances: asNumberArray(rawRollup?.[0]),
    exits: asNumberArray(rawRollup?.[2]),
    occupancyAvg: occupancyTriplets.map((bucket) =>
      Array.isArray(bucket) && typeof bucket[0] === "number" ? bucket[0] : 0,
    ),
    occupancyMin: occupancyTriplets.map((bucket) =>
      Array.isArray(bucket) && typeof bucket[1] === "number" ? bucket[1] : 0,
    ),
    occupancyMax: occupancyTriplets.map((bucket) =>
      Array.isArray(bucket) && typeof bucket[2] === "number" ? bucket[2] : 0,
    ),
    agePct: asNumberArray(rawRollup?.[3]),
    sexPct: asNumberArray(rawRollup?.[4]),
    racePct: asNumberArray(rawRollup?.[5]),
  };
};

const normalizePayload = (payload: unknown[]): NormalizedSnapshotPayload => {
  const rollups: Record<SiteFlowTimeframe, NormalizedRollup> = {
    today: EMPTY_ROLLUP,
    yesterday: EMPTY_ROLLUP,
    last_week: EMPTY_ROLLUP,
    last_month: EMPTY_ROLLUP,
    last_quarter: EMPTY_ROLLUP,
    last_year: EMPTY_ROLLUP,
    all_time: EMPTY_ROLLUP,
  };

  const contract = detectPayloadContract(payload);

  (Object.keys(TARGET_ROLLUP_SLOT) as SiteFlowTimeframe[]).forEach((timeframe) => {
    if (contract === "legacy_v1") {
      const bundle = Array.isArray(payload[7]) ? (payload[7] as unknown[]) : [];
      const raw = Array.isArray(bundle[LEGACY_ROLLUP_INDEX[timeframe]])
        ? (bundle[LEGACY_ROLLUP_INDEX[timeframe]] as unknown[])
        : [];
      rollups[timeframe] = normalizeLegacyRollup(raw);
      return;
    }
    const slot = TARGET_ROLLUP_SLOT[timeframe];
    const raw = Array.isArray(payload[slot]) ? (payload[slot] as unknown[]) : [];
    rollups[timeframe] = normalizeTargetRollup(raw);
  });

  const trafficSplit = contract === "legacy_v1"
    ? asNumberArray(payload[6])
    : asNumberArray(payload[5]);
  const capacity = contract === "legacy_v1"
    ? asNumberArray(payload[5])
    : asNumberArray(payload[6]);

  return {
    entrances96: asNumberArray(payload[0]),
    occupancy96: asNumberArray(payload[1]),
    exits96: asNumberArray(payload[2]),
    footfall96: asNumberArray(payload[3]),
    dwell96: asNumberArray(payload[4]),
    trafficSplit,
    capacity,
    rollups,
  };
};

export const buildSnapshotWidgetResult = (
  widgetId: string,
  snapshot: SnapshotResponse,
  timeframe: SiteFlowTimeframe,
  siteView: SiteView = "site-b",
): ChartResult => {
  const snapshotTs = parseSnapshotTimestamp(snapshot.ts);
  const payload = snapshot.payload ?? [];
  if (!Array.isArray(payload)) {
    throw new Error("Snapshot payload is not an array");
  }

  const normalized = normalizePayload(payload);
  const selectedRollup = normalized.rollups[timeframe] ?? EMPTY_ROLLUP;

  switch (widgetId) {
    case VRM_KPI_IDS.entrances:
      return buildKpiResult(normalized.entrances96, snapshotTs, widgetId);
    case VRM_KPI_IDS.occupancy:
      return buildKpiResult(normalized.occupancy96, snapshotTs, widgetId);
    case VRM_KPI_IDS.exits:
      return buildKpiResult(normalized.exits96, snapshotTs, widgetId);
    case VRM_KPI_IDS.footfall:
      return buildKpiResult(normalized.footfall96, snapshotTs, widgetId);
    case VRM_KPI_IDS.dwell:
      return buildKpiResult(normalized.dwell96, snapshotTs, widgetId);
    case VRM_KPI_IDS.capacity:
      return buildCapacityResult(normalized.capacity);
    case VRM_KPI_IDS.traffic:
      return buildTrafficResult(normalized.trafficSplit, siteView);
    case "live-flow":
    case "site-flow":
      return buildSiteFlowResult(selectedRollup, snapshotTs, timeframe);
    case "site-flow-demographics-age":
      return buildDemographicResult(selectedRollup.agePct, "age");
    case "site-flow-demographics-gender":
      return buildDemographicResult(selectedRollup.sexPct, "gender");
    case "site-flow-demographics-race":
      return buildDemographicResult(selectedRollup.racePct, "race");
    default:
      throw new Error(
        `Snapshot payload mapping not implemented for widget ${widgetId}`,
      );
  }
};
