const SNAPSHOT_ORGS = new Set(["client1", "client2"]);

const normalizeOrgId = (orgId: string | undefined): string | null => {
  if (!orgId) return null;
  return orgId.replace(/_compat$/i, "").toLowerCase();
};

export const isSnapshotOrg = (orgId: string | undefined): boolean => {
  const normalized = normalizeOrgId(orgId);
  if (!normalized) return false;
  return SNAPSHOT_ORGS.has(normalized);
};
