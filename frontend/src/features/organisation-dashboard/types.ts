export type EntityId = string; // Lossless decimal PostgreSQL bigint, never a URL slug.
export type Organisation = { id: EntityId; name: string; slug: string; enabled: boolean };
export type Site = Organisation & { organisation_id: EntityId; max_capacity: number };
export type OrganisationContext = { organisation: Organisation; sites: Site[] };
export type Selection = { scope: "organisation"; id: EntityId } | { scope: "site"; id: EntityId };
export const PERIODS = ["today", "yesterday", "week", "month", "quarter", "year", "all_time"] as const;
export type Period = typeof PERIODS[number];
export type OccupancyTriple = [number, number, number];
export type Rollup = {
  entrances: number[];
  occupancy: OccupancyTriple[];
  exits: number[];
  age_pct: number[];
  sex_pct: number[];
};
export type TrafficEntity = { name: string } & ({ site_id: EntityId } | { device_id: EntityId });
export type SnapshotPayload = Record<Period, Rollup> & {
  entrances_96: number[];
  occupancy_96: OccupancyTriple[];
  exits_96: number[];
  footfall_96: number[];
  dwell_time_96: number[];
  traffic_devices: TrafficEntity[];
  traffic_split_96: number[][];
  capacity: [number, number][];
};
export type SelectedSnapshot = {
  scope: Selection["scope"];
  entity_id: EntityId;
  entity_name: string;
  ts: string;
  payload: SnapshotPayload;
};
export type DashboardSource = {
  context(signal: AbortSignal): Promise<OrganisationContext>;
  snapshot(selection: Selection, signal: AbortSignal): Promise<SelectedSnapshot>;
};
