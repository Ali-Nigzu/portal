import type { AuthUser } from "../features/auth/transport/me";
import type { AuthenticatedOrganisation } from "../features/organisation-dashboard/api";
import { type ReactNode, createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";

type AuthenticatedApplicationInput = {
  user: AuthUser;
  organisations: AuthenticatedOrganisation[];
  refreshOrganisations: () => Promise<void>;
  refreshAccount?: (account?: AuthUser) => Promise<void>;
  accountSignal?: AbortSignal;
  favouritesCatalogueReady?: boolean;
  catalogueError?: boolean;
  recordOrganisation?: (organisation: AuthenticatedOrganisation) => void;
  removeOrganisation?: (id: string) => void;
};

type AuthenticatedApplicationValue = AuthenticatedApplicationInput & {
  favouriteStorageError: boolean;
  isScopeFavourite: (organisationId: string, siteId?: string) => boolean;
  toggleScopeFavourite: (organisationId: string, siteId?: string) => void;
};

const Context = createContext<AuthenticatedApplicationValue | null>(null);

export function AuthenticatedApplicationProvider({
  user,
  organisations,
  refreshOrganisations,
  favouritesCatalogueReady = true,
  catalogueError = false,
  recordOrganisation,
  removeOrganisation,
  refreshAccount,
  accountSignal,
  children,
}: AuthenticatedApplicationInput & { children: ReactNode }) {
  const [favourites, setFavourites] = useState(() => ({
    userId: user.id,
    hydrated: favouritesCatalogueReady,
    ...(favouritesCatalogueReady
      ? readFavouriteScopes(user.id, organisations)
      : { keys: new Set<string>(), storageError: false }),
  }));
  const validKeys = useMemo(
    () =>
      new Set(
        organisations.flatMap((organisation) => [
          favouriteScopeKey(organisation.id),
          ...organisation.sites.map((site) =>
            favouriteScopeKey(organisation.id, site.id),
          ),
        ]),
      ),
    [organisations],
  );
  useEffect(() => {
    if (!favouritesCatalogueReady) return;
    setFavourites((previous) => {
      if (previous.userId !== user.id || !previous.hydrated)
        return {
          userId: user.id,
          hydrated: true,
          ...readFavouriteScopes(user.id, organisations),
        };
      const keys = new Set(
        [...previous.keys].filter((key) => validKeys.has(key)),
      );
      return keys.size === previous.keys.size
        ? previous
        : { ...previous, keys };
    });
  }, [user.id, validKeys, favouritesCatalogueReady]);
  // Initial state is read before any persistence effect; a user change never
  // writes the previous user's keys into the new user's namespace.
  useEffect(() => {
    if (
      !favouritesCatalogueReady ||
      !favourites.hydrated ||
      favourites.userId !== user.id
    )
      return;
    const storageError = !writeFavouriteScopes(
      user.id,
      favourites.keys,
      organisations,
    );
    setFavourites((previous) =>
      previous.storageError === storageError
        ? previous
        : { ...previous, storageError },
    );
  }, [
    favourites.keys,
    favourites.userId,
    favourites.hydrated,
    user.id,
    organisations,
    favouritesCatalogueReady,
  ]);
  const isScopeFavourite = useCallback(
    (organisationId: string, siteId?: string) => {
      const key = favouriteScopeKey(organisationId, siteId);
      return (
        favouritesCatalogueReady &&
        favourites.userId === user.id &&
        validKeys.has(key) &&
        favourites.keys.has(key)
      );
    },
    [favourites, user.id, validKeys, favouritesCatalogueReady],
  );
  const toggleScopeFavourite = useCallback(
    (organisationId: string, siteId?: string) => {
      const key = favouriteScopeKey(organisationId, siteId);
      if (
        !favouritesCatalogueReady ||
        !favourites.hydrated ||
        favourites.userId !== user.id ||
        !validKeys.has(key)
      )
        return;
      setFavourites((previous) => {
        const keys = new Set(
          previous.userId === user.id
            ? [...previous.keys].filter((value) => validKeys.has(value))
            : [],
        );
        if (keys.has(key)) keys.delete(key);
        else keys.add(key);
        return {
          userId: user.id,
          hydrated: true,
          keys,
          storageError: previous.storageError,
        };
      });
    },
    [
      user.id,
      validKeys,
      favouritesCatalogueReady,
      catalogueError,
      recordOrganisation,
      removeOrganisation,
      favourites.hydrated,
      favourites.userId,
    ],
  );
  const value = useMemo(
    () => ({
      user,
      organisations,
      refreshAccount,
      accountSignal,
      refreshOrganisations,
      favouritesCatalogueReady,
      catalogueError,
      recordOrganisation,
      removeOrganisation,
      isScopeFavourite,
      toggleScopeFavourite,
      favouriteStorageError:
        favourites.userId === user.id && favourites.storageError,
    }),
    [
      user,
      organisations,
      refreshAccount,
      accountSignal,
      refreshOrganisations,
      favouritesCatalogueReady,
      isScopeFavourite,
      toggleScopeFavourite,
      favourites.userId,
      favourites.storageError,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuthenticatedApplication() {
  const value = useContext(Context);
  if (!value) throw new Error("Authenticated application context required");
  return value;
}

type FavouriteScope = {
  organisationId: string;
  scopeType: "organisation" | "site";
  scopeId: string;
};

const favouriteScopeKey = (organisationId: string, siteId?: string) =>
  `${organisationId}:${siteId === undefined ? `organisation:${organisationId}` : `site:${siteId}`}`;

const favouriteStorageKey = (userId: string) =>
  `camos_authenticated_favourites_v1:${encodeURIComponent(userId)}`;

function accessibleFavouriteScopes(organisations: AuthenticatedOrganisation[]) {
  const scopes = new Map<string, FavouriteScope>();
  for (const organisation of organisations) {
    scopes.set(favouriteScopeKey(organisation.id), {
      organisationId: organisation.id,
      scopeType: "organisation",
      scopeId: organisation.id,
    });
    for (const site of organisation.sites)
      scopes.set(favouriteScopeKey(organisation.id, site.id), {
        organisationId: organisation.id,
        scopeType: "site",
        scopeId: site.id,
      });
  }
  return scopes;
}

function readFavouriteScopes(
  userId: string,
  organisations: AuthenticatedOrganisation[],
) {
  const keys = new Set<string>();
  try {
    const raw = localStorage.getItem(favouriteStorageKey(userId));
    if (raw === null) return { keys, storageError: false };
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      return { keys, storageError: false };
    }
    if (record?.version !== 1 || !Array.isArray(record.scopes))
      return { keys, storageError: false };
    const allowed = accessibleFavouriteScopes(organisations);
    for (const scope of record.scopes) {
      if (
        !scope ||
        typeof scope.organisationId !== "string" ||
        typeof scope.scopeId !== "string"
      )
        continue;
      if (scope.scopeType !== "organisation" && scope.scopeType !== "site")
        continue;
      if (
        scope.scopeType === "organisation" &&
        scope.scopeId !== scope.organisationId
      )
        continue;
      const key = favouriteScopeKey(
        scope.organisationId,
        scope.scopeType === "site" ? scope.scopeId : undefined,
      );
      if (allowed.has(key)) keys.add(key);
    }
    return { keys, storageError: false };
  } catch {
    return { keys, storageError: true };
  }
}

function writeFavouriteScopes(
  userId: string,
  keys: ReadonlySet<string>,
  organisations: AuthenticatedOrganisation[],
) {
  try {
    const allowed = accessibleFavouriteScopes(organisations);
    const scopes = [...allowed]
      .filter(([key]) => keys.has(key))
      .map(([, scope]) => scope);
    localStorage.setItem(
      favouriteStorageKey(userId),
      JSON.stringify({ version: 1, scopes }),
    );
    return true;
  } catch {
    return false;
  }
}
