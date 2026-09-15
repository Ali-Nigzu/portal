import { API_BASE_URL } from "../../config";
import { PERIODS, type DashboardSource, type SelectedSnapshot } from "./types";

async function get(path: string, signal: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/api/demo/dashboard${path}`, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "Dashboard data not found." : "Dashboard is temporarily unavailable. Please retry.");
  }
  return response.json();
}

export function parseSnapshot(value: unknown): SelectedSnapshot {
  const snapshot = value as SelectedSnapshot;
  const fail = () => { throw new Error("Snapshot data is invalid."); };
  const vector = (values: unknown, length?: number): values is number[] =>
    Array.isArray(values) && (length === undefined || values.length === length)
    && values.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (!snapshot || !["organisation", "site"].includes(snapshot.scope)
    || typeof snapshot.entity_id !== "string" || typeof snapshot.entity_name !== "string"
    || typeof snapshot.ts !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.ts)
    || !Number.isFinite(Date.parse(snapshot.ts))) fail();
  const p = snapshot.payload;
  if (!p || Array.isArray(p)) fail();
  for (const key of ["entrances_96", "occupancy_96", "exits_96", "footfall_96", "dwell_time_96"] as const) {
    if (!vector(p[key], 96)) fail();
  }
  if (!Array.isArray(p.traffic_devices) || p.traffic_devices.some(e => !e || typeof e.name !== "string"
    || typeof (snapshot.scope === "organisation" ? (e as {site_id?: string}).site_id : (e as {device_id?: string}).device_id) !== "string")) fail();
  if (!Array.isArray(p.traffic_split_96) || p.traffic_split_96.length !== 96
    || p.traffic_split_96.some(row => !vector(row, p.traffic_devices.length))) fail();
  if (!Array.isArray(p.capacity) || p.capacity.length !== 96 || p.capacity.some(row => !vector(row, 2))) fail();
  const lengths = { yesterday: 24, week: 7, month: 4, quarter: 12, year: 12 };
  for (const period of PERIODS) {
    const r = p[period];
    if (!r || Array.isArray(r) || Object.keys(r).sort().join() !== "age_pct,entrances,exits,occupancy,sex_pct") fail();
    if (!vector(r.entrances) || !vector(r.exits, r.entrances.length)
      || !Array.isArray(r.occupancy) || r.occupancy.length !== r.entrances.length
      || r.occupancy.some(row => !vector(row, 3)) || !vector(r.age_pct, 6) || !vector(r.sex_pct, 2)) fail();
    if (period in lengths && r.entrances.length !== lengths[period as keyof typeof lengths]) fail();
    if (period === "today" && r.entrances.length > 24) fail();
  }
  return snapshot;
}

export const demoDashboardSource: DashboardSource = {
  context: signal => get("/context", signal),
  snapshot: async (selection, signal) => parseSnapshot(await get(
    selection.scope === "organisation" ? "/snapshot" : `/sites/${encodeURIComponent(selection.id)}/snapshot`, signal,
  )),
};
