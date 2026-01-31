export interface SnapshotResponse {
  ts: string;
  payload: unknown[];
  mode: "snapshots";
}
