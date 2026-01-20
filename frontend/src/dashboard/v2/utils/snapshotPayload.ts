import type { ChartResult, ChartSeries, DataPoint } from "../../../analytics/schemas/charting";
import { VRM_KPI_IDS, VRM_KPI_TITLES } from "./applyVRMOverrides";
import type { SiteFlowTimeframe } from "./siteFlowTimeframe";
import { bucketForSiteFlowTimeframe } from "./siteFlowTimeframe";

export interface SnapshotResponse {
  ts: string;
  payload: unknown[];
  mode: "snapshots";
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const ROLLUP_INDEX: Record<SiteFlowTimeframe, number> = {
  today: 0,
  yesterday: 1,
  last_week: 2,
  last_month: 3,
  last_quarter: 4,
  last_year: 5,
  all_time: 6,
};

const ROLLUP_STEP_MS: Record<SiteFlowTimeframe, number> = {
  today: HOUR_MS,
  yesterday: HOUR_MS,
  last_week: DAY_MS,
  last_month: WEEK_MS,
  last_quarter: MONTH_MS,
  last_year: MONTH_MS,
  all_time: YEAR_MS,
};

const asNumberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.map((item) => (typeof item === "number" ? item : 0)) : [];

const toIso = (value: Date): string => value.toISOString();

const buildTimeSeriesPoints = (values: number[], end: Date, stepMs: number): DataPoint[] =>
  values.map((value, index) => ({
    x: toIso(new Date(end.getTime() - (values.length - 1 - index) * stepMs)),
    y: value,
    value,
  }));

const buildKpiResult = (values: number[], snapshotTs: Date, widgetId: string): ChartResult => ({
  chartType: "single_value",
  xDimension: { id: "timestamp", type: "time", bucket: "15_MIN", timezone: "UTC" },
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
  const labels = ["Cam 0", "Cam 1", "Cam 2"];
  const data = values.map((value, index) => ({
    x: labels[index] ?? `Cam ${index + 1}`,
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
        title: "Traffic Split",
      },
    },
  };
};

const buildCapacityResult = (values: number[]): ChartResult => {
  const [currentPct = 0, peakPct = 0] = values;
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
      },
    },
  };
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
  const stepMs = ROLLUP_STEP_MS[timeframe];

  const length = Math.max(
    entrances.length,
    exits.length,
    occupancyAvg.length,
    occupancyMin.length,
    occupancyMax.length,
  );
  const timestamps = buildTimeSeriesPoints(
    Array.from({ length }, () => 0),
    snapshotTs,
    stepMs,
  ).map((point) => point.x);

  const buildSeries = (id: string, values: number[]): ChartSeries => ({
    id,
    label: id,
    geometry: "line",
    data: timestamps.map((x, index) => ({
      x,
      y: values[index] ?? 0,
      value: values[index] ?? 0,
    })),
  });

  const occupancySeries: ChartSeries = {
    id: "occupancy",
    label: "Occupancy",
    geometry: "line",
    data: timestamps.map((x, index) => ({
      x,
      occupancy_avg: occupancyAvg[index] ?? null,
      occupancy_min: occupancyMin[index] ?? null,
      occupancy_max: occupancyMax[index] ?? null,
      value: occupancyAvg[index] ?? null,
      y: occupancyAvg[index] ?? null,
    })),
  };

  return {
    chartType: "composed_time",
    xDimension: { id: "timestamp", type: "time", bucket: bucketForSiteFlowTimeframe(timeframe), timezone: "UTC" },
    series: [
      buildSeries("entrances", entrances),
      buildSeries("exits", exits),
      occupancySeries,
    ],
    meta: {
      timezone: "UTC",
      summary: {
        title: "Site Flow",
        presentation: "vrm",
      },
    },
  };
};

const buildDemographicResult = (values: number[], kind: "age" | "gender" | "race"): ChartResult => ({
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
  const snapshotTs = new Date(snapshot.ts);
  const payload = snapshot.payload ?? [];
  if (!Array.isArray(payload)) {
    throw new Error("Snapshot payload is not an array");
  }

  switch (widgetId) {
    case VRM_KPI_IDS.entrances:
      return buildKpiResult(asNumberArray(payload[0]), snapshotTs, widgetId);
    case VRM_KPI_IDS.occupancy:
      return buildKpiResult(asNumberArray(payload[1]), snapshotTs, widgetId);
    case VRM_KPI_IDS.exits:
      return buildKpiResult(asNumberArray(payload[2]), snapshotTs, widgetId);
    case VRM_KPI_IDS.footfall:
      return buildKpiResult(asNumberArray(payload[3]), snapshotTs, widgetId);
    case VRM_KPI_IDS.dwell:
      return buildKpiResult(asNumberArray(payload[4]), snapshotTs, widgetId);
    case VRM_KPI_IDS.capacity:
      return buildCapacityResult(asNumberArray(payload[5]));
    case VRM_KPI_IDS.traffic:
      return buildTrafficResult(asNumberArray(payload[6]));
    case "live-flow":
    case "site-flow": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      return buildSiteFlowResult(rollup ?? [], snapshotTs, timeframe);
    }
    case "site-flow-demographics-age": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      return buildDemographicResult(asNumberArray(rollup?.[5]), "age");
    }
    case "site-flow-demographics-gender": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      return buildDemographicResult(asNumberArray(rollup?.[6]), "gender");
    }
    case "site-flow-demographics-race": {
      const rollups = payload[7];
      const rollupIndex = ROLLUP_INDEX[timeframe];
      const rollup = Array.isArray(rollups) ? (rollups[rollupIndex] as unknown[]) : [];
      return buildDemographicResult(asNumberArray(rollup?.[7]), "race");
    }
    default:
      throw new Error(`Snapshot payload mapping not implemented for widget ${widgetId}`);
  }
};
