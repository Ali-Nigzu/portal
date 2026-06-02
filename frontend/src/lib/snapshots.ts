import type { SiteView } from "./siteView";

export interface SnapshotResponse {
  ts: string;
  payload: unknown[];
  mode: "snapshots";
  orgId?: string;
  siteView?: SiteView;
  fallback?: boolean;
}
