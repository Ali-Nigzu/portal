import type { SelectedSnapshot } from "../organisation-dashboard/types";
export type ReportSnapshotResponse = {
  scope: { organisation_id: string; site_id: string | null };
  snapshot: SelectedSnapshot;
};
export type ReportIdentity = {
  organisationName: string;
  siteName?: string;
  heading: string;
};
