import type {
  ChartResult,
  ChartSeries,
  DataPoint,
} from "../../../analytics/schemas/charting";
import type { SnapshotResponse } from "../../../lib/snapshots";
import { VRM_KPI_IDS, VRM_KPI_TITLES } from "./applyVRMOverrides";
import type { SiteFlowTimeframe } from "../../../lib/siteFlowTimeframe";
import { buildSiteFlowBucketLabels } from "../../../lib/siteFlowBuckets";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const NAIVE_TIMESTAMP_REGEX =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const ROLLUP_INDEX: Record<SiteFlowTimeframe, number> = {
  today: 0,
  yesterday: 1,
  last_week: 2,
  last_month: 3,
  last_quarter: 4,
  last_year: 5,
  all_time: 6,
};
const asNumberArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "number" ? item : 0))
    : [];
const getKpiSeries = (payload: unknown[], index: number): number[] =>
  asNumberArray(Array.isArray(payload) ? payload[index] : []);
const toIso = (value: Date): string => value.toISOString();
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const parseSnapshotTimestamp = (value: string): Date => {
  if (NAIVE_TIMESTAMP_REGEX.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
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
const buildKpiResult = (
  values: number[],
  snapshotTs: Date,
  widgetId: string,
): ChartResult => ({
  chartType: "single_value",
  xDimension: {
    id: "timestamp",
    type: "time",
    bucket: "15_MIN",
    timezone: "UTC",
  },
  series: [
    {
      id: widgetId,
      label: VRM_KPI_TITLES[widgetId] ?? widgetId,
      geometry: "line",
      data: buildTimeSeriesPoints(values, snapshotTs, FIFTEEN_MINUTES_MS),
    },
  ],
  meta: {
    timezone: "UTC",
    summary: {
      widgetId,
      title: VRM_KPI_TITLES[widgetId] ?? widgetId,
      presentation: "vrm",
    },
  },
});
const buildTrafficResult = (values: number[]): ChartResult => {
  const labels = ["Camera 0", "Camera 1", "Camera 2"];
  const normalized = Array.from({ length: 3 }, (_, index) =>
    typeof values[index] === "number" ? values[index] : 0,
  );
  const data = normalized.map((value, index) => ({
    x: labels[index] ?? `Camera ${index + 1}`,
    y: value,
    value,
  }));
  const series: ChartSeries = {
    id: "traffic_share",
    label: "Traffic by Camera",
    geometry: "bar",
    unit: "percentage",
    data,
  };
  return {
    chartType: "categorical",
    xDimension: { id: "camera", type: "category" },
    series: [series],
    meta: {
      timezone: "UTC",
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
      timezone: "UTC",
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
const normalizeSeriesLength = (values: number[], count: number): number[] => {
  const sliced = values.slice(0, count);
  if (sliced.length >= count) {
    return sliced;
  }
  return [...sliced, ...Array.from({ length: count - sliced.length }, () => 0)];
};
const buildSiteFlowResult = (
  rollup: unknown[],
  snapshotTs: Date,
  timeframe: SiteFlowTimeframe,
): ChartResult => {
  const entrances = asNumberArray(rollup?.[0]);
  const exits = asNumberArray(rollup?.[1]);
  const occupancyAvg = asNumberArray(rollup?.[2]);
  const occupancyMin = asNumberArray(rollup?.[3]);
  const occupancyMax = asNumberArray(rollup?.[4]);
  const { bucket, timestamps, sliceCount } = buildSiteFlowBucketLabels(
    timeframe,
    snapshotTs,
    [entrances, exits, occupancyAvg, occupancyMin, occupancyMax],
  );
  const normalizedEntrances = normalizeSeriesLength(entrances, sliceCount);
  const normalizedExits = normalizeSeriesLength(exits, sliceCount);
  const normalizedOccAvg = normalizeSeriesLength(occupancyAvg, sliceCount);
  const normalizedOccMin = normalizeSeriesLength(occupancyMin, sliceCount);
  const normalizedOccMax = normalizeSeriesLength(occupancyMax, sliceCount);
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
    xDimension: { id: "timestamp", type: "time", bucket, timezone: "UTC" },
    series: [
      buildSeries("entrances", normalizedEntrances),
      buildSeries("exits", normalizedExits),
      { ...occupancySeries, data: occupancySeries.data.slice(0, sliceCount) },
    ],
    meta: {
      timezone: "UTC",
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
  meta: { timezone: "UTC", summary: { title: kind } },
});
export const buildSnapshotWidgetResult = (
  widgetId: string,
  snapshot: SnapshotResponse,
  timeframe: SiteFlowTimeframe,
): ChartResult => {
  const snapshotTs = parseSnapshotTimestamp(snapshot.ts);
  const payload = snapshot.payload ?? [];
  if (!Array.isArray(payload)) {
    throw new Error("Snapshot payload is not an array");
  }
  if (!Array.isArray(payload[7])) {
    throw new Error(
      "Snapshot payload missing legacy rollup array at payload[7]",
    );
  }
  switch (widgetId) {
    case VRM_KPI_IDS.entrances: {
      const series = getKpiSeries(payload, 0);
      return buildKpiResult(series, snapshotTs, widgetId);
    }
    case VRM_KPI_IDS.occupancy:
      return buildKpiResult(getKpiSeries(payload, 1), snapshotTs, widgetId);
    case VRM_KPI_IDS.exits: {
      const series = getKpiSeries(payload, 2);
      return buildKpiResult(series, snapshotTs, widgetId);
    }
    case VRM_KPI_IDS.footfall:
      return buildKpiResult(getKpiSeries(payload, 3), snapshotTs, widgetId);
    case VRM_KPI_IDS.dwell:
      return buildKpiResult(getKpiSeries(payload, 4), snapshotTs, widgetId);
    case VRM_KPI_IDS.capacity:
      return buildCapacityResult(asNumberArray(payload[5]));
    case VRM_KPI_IDS.traffic:
      return buildTrafficResult(asNumberArray(payload[6]));
    case "live-flow":
    case "site-flow": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups)
        ? (rollups[rollupIndex] as unknown[])
        : [];
      return buildSiteFlowResult(rollup ?? [], snapshotTs, timeframe);
    }
    case "site-flow-demographics-age": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups)
        ? (rollups[rollupIndex] as unknown[])
        : [];
      return buildDemographicResult(asNumberArray(rollup?.[5]), "age");
    }
    case "site-flow-demographics-gender": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups)
        ? (rollups[rollupIndex] as unknown[])
        : [];
      return buildDemographicResult(asNumberArray(rollup?.[6]), "gender");
    }
    case "site-flow-demographics-race": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups)
        ? (rollups[rollupIndex] as unknown[])
        : [];
      return buildDemographicResult(asNumberArray(rollup?.[7]), "race");
    }
    default:
      throw new Error(
        `Snapshot payload mapping not implemented for widget ${widgetId}`,
      );
  }
};
