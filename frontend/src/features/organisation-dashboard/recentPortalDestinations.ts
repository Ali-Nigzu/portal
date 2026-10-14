import { optionalLocalStorage } from "../../common/optionalStorage";
import type { AuthenticatedOrganisation } from "./api";

import { PORTAL_MODULE_LABELS, authenticatedPortalPath, isPortalModule, type AuthenticatedPortalLocation } from "./authenticatedPortalRoutes";

const STORAGE_KEY = "camos_authenticated_portal_recent_v1";
const LIMIT = 5;

type RecentPortalDestination = AuthenticatedPortalLocation & { viewedAt: number };

function parseStored(userId: string): unknown[] {
  try {
    const value = JSON.parse(optionalLocalStorage.getItem(`${STORAGE_KEY}:${encodeURIComponent(userId)}`) ?? "[]");
    return Array.isArray(value) ? value.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function recordRecentPortalLocation(userId: string, location: AuthenticatedPortalLocation) {
  const record: RecentPortalDestination = { ...location, viewedAt: Date.now() };
  const remaining = parseStored(userId).filter((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<RecentPortalDestination>;
    return !(candidate.organisationId === location.organisationId &&
      candidate.siteId === location.siteId && candidate.module === location.module);
  });
  optionalLocalStorage.setItem(`${STORAGE_KEY}:${encodeURIComponent(userId)}`, JSON.stringify([record, ...remaining].slice(0, LIMIT)));
}

export function readRecentPortalDestinations(
  userId: string,
  organisations: AuthenticatedOrganisation[],
): Array<RecentPortalDestination & { label: string; path: string }> {
  const result: Array<RecentPortalDestination & { label: string; path: string }> = [];
  for (const item of parseStored(userId)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<RecentPortalDestination>;
    if (typeof candidate.organisationId !== "string" ||
        typeof candidate.module !== "string" || !isPortalModule(candidate.module) ||
        typeof candidate.viewedAt !== "number") continue;
    const organisation = organisations.find((value) => value.id === candidate.organisationId);
    if (!organisation) continue;
    const site = candidate.siteId === undefined
      ? undefined
      : organisation.sites.find((value) => value.id === candidate.siteId);
    if (candidate.siteId !== undefined && !site) continue;
    const destination: RecentPortalDestination = {
      organisationId: organisation.id,
      siteId: site?.id,
      module: candidate.module,
      viewedAt: candidate.viewedAt,
    };
    result.push({
      ...destination,
      label: `${organisation.name} · ${site?.name ?? "All Sites"} · ${PORTAL_MODULE_LABELS[candidate.module]}`,
      path: authenticatedPortalPath(destination),
    });
    if (result.length === LIMIT) break;
  }
  return result;
}
