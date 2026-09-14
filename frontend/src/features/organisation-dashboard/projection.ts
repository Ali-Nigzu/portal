import type { ChartResult, ChartSeries } from "../../analytics/schemas/charting";
import { VRM_KPI_IDS, VRM_KPI_TITLES } from "../dashboard/utils/applyVRMOverrides";
import { SITE_FLOW_ACTIVITY_COLORS } from "../../lib/siteFlowActivityColors";
import type { Period, Rollup, SelectedSnapshot } from "./types";

const QUARTER_HOUR = 900000;
const DAY = 86400000;
export const PERIOD_OPTIONS: Array<{value: Period; label: string}> = [
  { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Week" }, { value: "month", label: "Last 4 ISO Weeks" },
  { value: "quarter", label: "Last 12 ISO Weeks" }, { value: "year", label: "Year" },
  { value: "all_time", label: "All Time" },
];

export function rollingTimestamps(ts: string) {
  const end = Math.floor(Date.parse(ts) / QUARTER_HOUR) * QUARTER_HOUR;
  return Array.from({ length: 96 }, (_, i) => new Date(end - (95 - i) * QUARTER_HOUR).toISOString());
}

export function periodTimestamps(period: Period, ts: string, length: number): string[] {
  const date = new Date(ts);
  const year = date.getUTCFullYear();
  const midnight = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const monday = midnight - ((date.getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length }, (_, i) => {
    let value: number;
    switch (period) {
      case "today": value = midnight + i * 3600000; break;
      case "yesterday": value = midnight - DAY + i * 3600000; break;
      case "week": value = monday + i * DAY; break;
      case "month": case "quarter": value = monday - (length - 1 - i) * 7 * DAY; break;
      case "year": value = Date.UTC(year, i, 1); break;
      case "all_time": value = Date.UTC(year - length + 1 + i, 0, 1); break;
    }
    return new Date(value).toISOString();
  });
}

export function formatSnapshotTick(period: string, value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  const format = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-GB", { timeZone: "UTC", ...options });
  if (period === "today" || period === "yesterday") return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
  if (period === "week") return format({ weekday: "short" });
  if (period === "month" || period === "quarter") return `Wk of ${format({ month: "short", day: "numeric" })}`;
  if (period === "year") return format({ month: "short" });
  return String(date.getUTCFullYear());
}

const metadata = (title: string, extra: Record<string, string | number | null> = {}) => ({
  timezone: "UTC", summary: { title, presentation: "vrm", canonicalSnapshot: 1, ...extra },
});

export function projectKpis(snapshot: SelectedSnapshot): Array<{id: string; title: string; result: ChartResult}> {
  const p = snapshot.payload;
  const timestamps = rollingTimestamps(snapshot.ts);
  const configs = [
    [VRM_KPI_IDS.entrances, p.entrances_96, "events", "#5f7f6c"],
    [VRM_KPI_IDS.occupancy, p.occupancy_96, "people", "#5f7694"],
    [VRM_KPI_IDS.exits, p.exits_96, "events", "#8a6267"],
    [VRM_KPI_IDS.footfall, p.footfall_96, "events", "#9b7420"],
    [VRM_KPI_IDS.dwell, p.dwell_time_96.map(v => v / 60), "minutes", "#6f6483"],
  ] as const;
  const result: Array<{id: string; title: string; result: ChartResult}> = configs.map(([id, values, unit, color]) => ({
    id, title: VRM_KPI_TITLES[id], result: {
      chartType: "single_value", xDimension: { id: "timestamp", type: "time", bucket: "15_MIN", timezone: "UTC" },
      series: [{ id, label: VRM_KPI_TITLES[id], unit, color, geometry: "line",
        data: values.map((value, i) => ({ x: timestamps[i], y: value, value })) }],
      meta: metadata(VRM_KPI_TITLES[id], { headlineValue: values[95], compact: 1 }),
    } as ChartResult,
  }));
  const trafficId = VRM_KPI_IDS.traffic;
  result.push({ id: trafficId, title: VRM_KPI_TITLES[trafficId], result: {
    chartType: "categorical", xDimension: { id: "entity", type: "category" },
    series: [{ id: "traffic_share", label: snapshot.scope === "organisation" ? "Traffic by Site" : "Traffic by Device", geometry: "bar", unit: "percentage",
      data: p.traffic_devices.map((entity, i) => ({
        x: "site_id" in entity ? `site:${entity.site_id}` : `device:${entity.device_id}`,
        label: entity.name, value: p.traffic_split_96[95][i], y: p.traffic_split_96[95][i],
      })) }],
    meta: metadata("Traffic Split", { chartStyle: "traffic_distribution" }),
  } });
  const [average, peak] = p.capacity[95];
  // Geometry is bounded; raw supplied percentages remain headline/tooltip values.
  const usageArc = Math.min(average, 100);
  const peakArc = Math.min(Math.max(peak, average), 100);
  result.push({ id: VRM_KPI_IDS.capacity, title: "Capacity", result: {
    chartType: "categorical", xDimension: { id: "capacity_segment", type: "category" },
    series: [{ id: "capacity", label: "Capacity", geometry: "bar", unit: "percentage", data: [
      { x: "Usage", value: usageArc }, { x: "Peak extra", value: peakArc - usageArc },
      { x: "Remaining", value: 100 - peakArc },
    ] }], meta: metadata("Capacity", { chartStyle: "capacity_usage", headlineValue: average,
      capacity_average_pct: average, capacity_rolling_peak_pct: peak }),
  } });
  return result;
}

export function projectActivity(snapshot: SelectedSnapshot, period: Period): ChartResult {
  const r = snapshot.payload[period];
  const timestamps = periodTimestamps(period, snapshot.ts, r.entrances.length);
  const series: ChartSeries[] = ["entrances", "exits"].map(id => ({ id,
    label: id === "entrances" ? "Entrances" : "Exits", geometry: "bar", unit: "events",
    color: SITE_FLOW_ACTIVITY_COLORS[id],
    data: r[id as "entrances" | "exits"].map((value, i) => ({ x: timestamps[i], y: value, value })),
  }));
  series.push({ id: "occupancy", label: "Occupancy", geometry: "line", unit: "people",
    color: SITE_FLOW_ACTIVITY_COLORS.occupancy,
    data: r.occupancy.map(([average, minimum, maximum], i) => ({ x: timestamps[i], value: average, y: average,
      occupancy_avg: average, occupancy_min: minimum, occupancy_max: maximum })),
  });
  return { chartType: "composed_time", xDimension: { id: "timestamp", type: "time", timezone: "UTC",
    bucket: period === "today" || period === "yesterday" ? "HOUR" : period === "week" ? "DAY" : period === "year" ? "MONTH" : period === "all_time" ? "YEAR" : "WEEK" },
    series, meta: metadata("Site Flow", { siteFlowTimeframe: period, chartStyle: "site_flow_activity" }),
  };
}

export function projectDemographics(rollup: Rollup): Array<{id: string; result: ChartResult}> {
  return [
    { id: "age", title: "Age", labels: ["0–4", "5–13", "14–25", "26–45", "46–65", "66+"], values: rollup.age_pct },
    { id: "sex", title: "Sex", labels: ["Male", "Female"], values: rollup.sex_pct },
  ].map(({ id, title, labels, values }) => ({ id, result: {
    chartType: "categorical", xDimension: { id, type: "category" },
    series: [{ id, label: title, geometry: "bar", unit: "percentage",
      data: values.map((value, index) => ({ x: `${id}:${index}`, label: labels[index], value, y: value })) }],
    meta: metadata(title, { chartStyle: "traffic_distribution" }),
  } }));
}
