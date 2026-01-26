const SNAPSHOT_ORGS = new Set(["client1", "client2"]);
const normalizeOrgId = (orgId: string | undefined): string | null => {
  if (!orgId) return null;
  const trimmed = orgId
    .trim()
    .toLowerCase()
    .replace(/_compat$/i, "");
  if (!trimmed) return null;
  const segments = trimmed.split(".");
  return segments[segments.length - 1] || null;
};
export const isSnapshotOrg = (orgId: string | undefined): boolean => {
  const normalized = normalizeOrgId(orgId);
  if (!normalized) return false;
  return SNAPSHOT_ORGS.has(normalized);
};
