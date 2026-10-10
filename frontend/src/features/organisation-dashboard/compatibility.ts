/** Only unresolved historical surfaces: Landing channel identity and zeroed customer aliases.
 * Never use this source in canonical Portal/Demo/Reports or as authentication.
 */
import { API_BASE_URL } from "../../config";
import type {
  ChartResult,
  ChartSeries,
} from "../../analytics/schemas/charting";
import { SITE_FLOW_ACTIVITY_COLORS } from "../../analytics/schemas/charting";
import {
  formatDemoTimestamp,
  parseDemoTimestamp,
} from "../../analytics/components/ChartRenderer/utils/format";
import {
  buildSiteFlowBucketLabels,
  type ReportTimeframe,
} from "../reports/utils/reportUtils";
import { VRM_KPI_IDS, VRM_KPI_TITLES } from "./projection";
import type { SiteView } from "./selection";

export type HistoricalSnapshot = { ts: string; payload: unknown[] };
export async function loadHistoricalSnapshot(
  siteView: SiteView,
  signal: AbortSignal,
  demo = false,
): Promise<HistoricalSnapshot> {
  const params = new URLSearchParams({ siteView });
  if (!demo) params.set("org", "client1");
  const response = await fetch(
    `${API_BASE_URL}/api/snapshots/latest?${params}`,
    {
      signal,
      headers: { "Content-Type": "application/json" },
      credentials: demo ? "include" : "same-origin",
    },
  );
  if (!response.ok)
    throw new Error(
      `Snapshot fetch failed: ${response.status} ${await response.text()}`,
    );
  return response.json();
}

const labels = (siteView: SiteView) =>
  siteView === "all"
    ? ["Alis Barber", "Tokis Takeout"]
    : siteView === "site-a"
      ? ["Entrance", "Exit"]
      : ["Main", "Delivery", "Back"];
const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.map((x) => (typeof x === "number" ? x : 0)) : [];
function payloadContract(snapshot: HistoricalSnapshot) {
  if (!Array.isArray(snapshot.payload))
    throw new Error("Snapshot payload is not an array");
  const date = parseDemoTimestamp(snapshot.ts);
  if (!date)
    throw new Error(`Unparseable demo snapshot timestamp: ${snapshot.ts}`);
  const p = snapshot.payload;
  if (p.length >= 14 && p.slice(7, 14).every(Array.isArray)) return "target";
  if (
    p.length >= 8 &&
    Array.isArray(p[7]) &&
    p[7].length > 0 &&
    Array.isArray(p[7][0])
  )
    return "legacy";
  throw new Error("Unsupported snapshot payload contract for demo site flow");
}
export function historicalTraffic(
  snapshot: HistoricalSnapshot,
  siteView: SiteView,
  zero = false,
): ChartResult {
  const values = numbers(
    snapshot.payload[payloadContract(snapshot) === "target" ? 5 : 6],
  );
  const names = labels(siteView);
  const data = Array.from(
    { length: Math.max(values.length, names.length) },
    (_, i) => ({
      x: names[i] ?? `Segment ${i + 1}`,
      value: zero ? 0 : Number.isFinite(values[i]) ? values[i] : 0,
      y: zero ? 0 : Number.isFinite(values[i]) ? values[i] : 0,
    }),
  );
  let top = data[0];
  for (const point of data) if (point.value >= top.value) top = point;
  return {
    chartType: "categorical",
    xDimension: { id: "camera", type: "category" },
    series: [
      {
        id: "traffic_share",
        label: "Traffic by Camera",
        geometry: "bar",
        unit: "percentage",
        data,
      },
    ],
    meta: {
      timezone: "DEMO_CLOCK",
      summary: {
        presentation: "vrm",
        compact: 1,
        chartStyle: "traffic_distribution",
        chartSubType: "traffic_distribution",
        traffic_distribution_source: "snapshot_pct",
        title: "Traffic Split",
        headlineValue: top.value,
        headline: `${top.x} – ${Math.round(top.value)}%`,
        legendTitle: "Camera",
      },
    },
  };
}

// Zero is a presentation rule on supported aliases, never a canonical empty-org snapshot.
export function historicalZeroKpis(
  snapshot: HistoricalSnapshot,
  siteView: SiteView,
) {
  const date = parseDemoTimestamp(snapshot.ts);
  if (!date)
    throw new Error(`Unparseable demo snapshot timestamp: ${snapshot.ts}`);
  payloadContract(snapshot);
  const end = Math.floor(date.getTime() / 900000) * 900000;
  const colors = [
    "var(--vrm-kpi-accent-entrances, #5f7f6c)",
    "var(--vrm-kpi-accent-occupancy, #5f7694)",
    "var(--vrm-kpi-accent-exits, #8a6267)",
    "var(--vrm-kpi-accent-footfall, var(--signal-gold, #9b7420))",
    "var(--vrm-kpi-accent-dwell, #6f6483)",
  ];
  const ids = [
    VRM_KPI_IDS.entrances,
    VRM_KPI_IDS.occupancy,
    VRM_KPI_IDS.exits,
    VRM_KPI_IDS.footfall,
    VRM_KPI_IDS.dwell,
  ];
  const kpis: Array<{ id: string; title: string; result: ChartResult }> =
    ids.map((id, i) => ({
      id,
      title: VRM_KPI_TITLES[id],
      result: {
        chartType: "single_value",
        xDimension: {
          id: "timestamp",
          type: "time",
          bucket: "15_MIN",
          timezone: "DEMO_CLOCK",
        },
        series: [
          {
            id,
            label: VRM_KPI_TITLES[id],
            geometry: "line",
            color: colors[i],
            data: Array.from({ length: 97 }, (_, j) => ({
              x: formatDemoTimestamp(new Date(end - (96 - j) * 900000)),
              y: 0,
              value: 0,
            })),
          },
        ],
        meta: {
          timezone: "DEMO_CLOCK",
          summary: {
            widgetId: id,
            title: VRM_KPI_TITLES[id],
            presentation: "vrm",
            compact: 1,
            headlineValue: 0,
          },
        },
      } as ChartResult,
    }));
  kpis.push({
    id: VRM_KPI_IDS.traffic,
    title: "Traffic Split",
    result: historicalTraffic(snapshot, siteView, true),
  });
  kpis.push({
    id: VRM_KPI_IDS.capacity,
    title: "Capacity",
    result: {
      chartType: "categorical",
      xDimension: { id: "capacity_segment", type: "category" },
      series: [
        {
          id: "capacity",
          label: "Capacity usage",
          geometry: "bar",
          unit: "percentage",
          data: [
            { x: "Usage", value: 0, y: 0 },
            { x: "Peak extra", value: 0, y: 0 },
            { x: "Remaining", value: 100, y: 100 },
          ],
        },
      ],
      meta: {
        timezone: "DEMO_CLOCK",
        summary: {
          title: "Capacity",
          presentation: "vrm",
          compact: 1,
          headlineValue: 0,
          chartStyle: "capacity_usage",
          chartSubType: "capacity_usage",
          vrmChipText: "peak: 0%",
          capacity_usage_now: 0,
          peak_capacity_usage_today: 0,
        },
      },
    },
  });
  return kpis;
}
export function historicalZeroActivity(
  snapshot: HistoricalSnapshot,
  timeframe: ReportTimeframe,
): ChartResult {
  const date = parseDemoTimestamp(snapshot.ts);
  if (!date)
    throw new Error(`Unparseable demo snapshot timestamp: ${snapshot.ts}`);
  const periods = [
    "today",
    "yesterday",
    "last_week",
    "last_month",
    "last_quarter",
    "last_year",
    "all_time",
  ];
  const index = periods.indexOf(timeframe);
  const target = payloadContract(snapshot) === "target";
  const p = snapshot.payload;
  const raw = target ? p[7 + index] : (p[7] as unknown[])[index];
  const rollup = Array.isArray(raw) ? raw : [];
  if (
    target &&
    (rollup.length < 6 ||
      ![0, 2, 3, 4, 5].every((i) => Array.isArray(rollup[i])))
  ) {
    throw new Error(
      rollup.length < 6
        ? "Target rollup must contain 6 series slots"
        : "Target rollup entrances/exits must be arrays",
    );
  }
  const lengths = target
    ? [
        numbers(rollup[0]),
        numbers(rollup[2]),
        Array.isArray(rollup[1]) ? rollup[1].map(() => 0) : [],
      ]
    : rollup.slice(0, 5).map(numbers);
  const { bucket, timestamps } = buildSiteFlowBucketLabels(
    timeframe,
    date,
    lengths,
  );
  const data = timestamps.map((t) => ({
    x: formatDemoTimestamp(t),
    y: 0,
    value: 0,
  }));
  const series: ChartSeries[] = ["entrances", "exits"].map((id) => ({
    id,
    label: id === "entrances" ? "Entrances" : "Exits",
    geometry: "bar",
    unit: "events",
    color: SITE_FLOW_ACTIVITY_COLORS[id],
    data,
  }));
  series.push({
    id: "occupancy",
    label: "Occupancy",
    geometry: "line",
    unit: "people",
    color: SITE_FLOW_ACTIVITY_COLORS.occupancy,
    noDots: true,
    seriesGroup: "occupancy",
    data: data.map((p) => ({
      ...p,
      occupancy_avg: 0,
      occupancy_min: 0,
      occupancy_max: 0,
    })),
  });
  return {
    chartType: "composed_time",
    xDimension: {
      id: "timestamp",
      type: "time",
      bucket,
      timezone: "DEMO_CLOCK",
    },
    series,
    meta: {
      timezone: "DEMO_CLOCK",
      summary: {
        title: "Site Flow",
        presentation: "vrm",
        siteFlowTimeframe: timeframe,
      },
    },
  };
}
