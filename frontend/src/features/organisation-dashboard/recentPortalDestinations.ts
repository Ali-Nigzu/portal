import type { AuthenticatedOrganisation } from "./api";
import { PORTAL_MODULE_LABELS } from "./authenticatedPortalRoutes";
import {
  authenticatedPortalPath,
  isPortalModule,
  type AuthenticatedPortalLocation,
} from "./authenticatedPortalRoutes";

const STORAGE_KEY = "camos_authenticated_portal_recent_v1";
const LIMIT = 5;

export type RecentPortalDestination = AuthenticatedPortalLocation & { viewedAt: number };

function parseStored(): unknown[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function recordRecentPortalLocation(location: AuthenticatedPortalLocation) {
  const record: RecentPortalDestination = { ...location, viewedAt: Date.now() };
  const remaining = parseStored().filter((item) => {
    const candidate = item as Partial<RecentPortalDestination>;
    return !(candidate.organisationId === location.organisationId &&
      candidate.siteId === location.siteId && candidate.module === location.module);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...remaining].slice(0, LIMIT)));
}

export function readRecentPortalDestinations(
  organisations: AuthenticatedOrganisation[],
): Array<RecentPortalDestination & { label: string; path: string }> {
  const result: Array<RecentPortalDestination & { label: string; path: string }> = [];
  for (const item of parseStored()) {
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
