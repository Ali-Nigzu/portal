import type { AuthenticatedOrganisation } from "./api";

export type FavouriteScope = {
  organisationId: string;
  scopeType: "organisation" | "site";
  scopeId: string;
};

export const favouriteScopeKey = (organisationId: string, siteId?: string) =>
  `${organisationId}:${siteId === undefined ? `organisation:${organisationId}` : `site:${siteId}`}`;

export const favouriteStorageKey = (userId: string) =>
  `camos_authenticated_favourites_v1:${encodeURIComponent(userId)}`;

export function accessibleFavouriteScopes(organisations: AuthenticatedOrganisation[]) {
  const scopes = new Map<string, FavouriteScope>();
  for (const organisation of organisations) {
    scopes.set(favouriteScopeKey(organisation.id), {
      organisationId: organisation.id, scopeType: "organisation", scopeId: organisation.id,
    });
    for (const site of organisation.sites) scopes.set(favouriteScopeKey(organisation.id, site.id), {
      organisationId: organisation.id, scopeType: "site", scopeId: site.id,
    });
  }
  return scopes;
}

export function readFavouriteScopes(userId: string, organisations: AuthenticatedOrganisation[]) {
  const keys = new Set<string>();
  try {
    const raw = localStorage.getItem(favouriteStorageKey(userId));
    if (raw === null) return { keys, storageError: false };
    let record;
    try { record = JSON.parse(raw); } catch { return { keys, storageError: false }; }
    if (record?.version !== 1 || !Array.isArray(record.scopes)) return { keys, storageError: false };
    const allowed = accessibleFavouriteScopes(organisations);
    for (const scope of record.scopes) {
      if (!scope || typeof scope.organisationId !== "string" || typeof scope.scopeId !== "string") continue;
      if (scope.scopeType !== "organisation" && scope.scopeType !== "site") continue;
      if (scope.scopeType === "organisation" && scope.scopeId !== scope.organisationId) continue;
      const key = favouriteScopeKey(scope.organisationId, scope.scopeType === "site" ? scope.scopeId : undefined);
      if (allowed.has(key)) keys.add(key);
    }
    return { keys, storageError: false };
  } catch {
    return { keys, storageError: true };
  }
}

export function writeFavouriteScopes(userId: string, keys: ReadonlySet<string>, organisations: AuthenticatedOrganisation[]) {
  try {
    const allowed = accessibleFavouriteScopes(organisations);
    const scopes = [...allowed].filter(([key]) => keys.has(key)).map(([, scope]) => scope);
    localStorage.setItem(favouriteStorageKey(userId), JSON.stringify({ version: 1, scopes }));
    return true;
  } catch {
    return false;
  }
}
