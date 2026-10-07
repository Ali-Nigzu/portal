import { createContext, useContext, useMemo, useState, useEffect, useCallback, type ReactNode } from "react";
import type { AuthUser } from "../features/auth/transport/me";
import type { AuthenticatedOrganisation } from "../features/auth/transport/organisations";
import { favouriteScopeKey, readFavouriteScopes, writeFavouriteScopes } from "../features/organisation-dashboard/favouriteScopesStorage";

type AuthenticatedApplicationInput = {
  user: AuthUser;
  organisations: AuthenticatedOrganisation[];
  refreshOrganisations: () => Promise<void>;
  refreshAccount?: () => Promise<void>;
  favouritesCatalogueReady?: boolean;
};

export { favouriteScopeKey } from "../features/organisation-dashboard/favouriteScopesStorage";

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
  refreshAccount,
  children,
}: AuthenticatedApplicationInput & { children: ReactNode }) {
  const [favourites, setFavourites] = useState(() => ({ userId: user.id, hydrated: favouritesCatalogueReady, ...(favouritesCatalogueReady ? readFavouriteScopes(user.id, organisations) : { keys: new Set<string>(), storageError: false }) }));
  const validKeys = useMemo(() => new Set(organisations.flatMap(organisation => [
    favouriteScopeKey(organisation.id),
    ...organisation.sites.map(site => favouriteScopeKey(organisation.id, site.id)),
  ])), [organisations]);
  useEffect(() => {
    if (!favouritesCatalogueReady) return;
    setFavourites(previous => {
      if (previous.userId !== user.id || !previous.hydrated) return { userId: user.id, hydrated: true, ...readFavouriteScopes(user.id, organisations) };
      const keys = new Set([...previous.keys].filter(key => validKeys.has(key)));
      return keys.size === previous.keys.size ? previous : { ...previous, keys };
    });
  }, [user.id, validKeys, favouritesCatalogueReady]);
  // Initial state is read before any persistence effect; a user change never
  // writes the previous user's keys into the new user's namespace.
  useEffect(() => {
    if (!favouritesCatalogueReady || !favourites.hydrated || favourites.userId !== user.id) return;
    const storageError = !writeFavouriteScopes(user.id, favourites.keys, organisations);
    setFavourites(previous => previous.storageError === storageError ? previous : { ...previous, storageError });
  }, [favourites.keys, favourites.userId, favourites.hydrated, user.id, organisations, favouritesCatalogueReady]);
  const isScopeFavourite = useCallback((organisationId: string, siteId?: string) => {
    const key = favouriteScopeKey(organisationId, siteId);
    return favouritesCatalogueReady && favourites.userId === user.id && validKeys.has(key) && favourites.keys.has(key);
  }, [favourites, user.id, validKeys, favouritesCatalogueReady]);
  const toggleScopeFavourite = useCallback((organisationId: string, siteId?: string) => {
    const key = favouriteScopeKey(organisationId, siteId);
    if (!favouritesCatalogueReady || !favourites.hydrated || favourites.userId !== user.id || !validKeys.has(key)) return;
    setFavourites(previous => {
      const keys = new Set(previous.userId === user.id ? [...previous.keys].filter(value => validKeys.has(value)) : []);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      return { userId: user.id, hydrated: true, keys, storageError: previous.storageError };
    });
  }, [user.id, validKeys, favouritesCatalogueReady, favourites.hydrated, favourites.userId]);
  const value = useMemo(
    () => ({ user, organisations, refreshAccount, refreshOrganisations, favouritesCatalogueReady, isScopeFavourite, toggleScopeFavourite, favouriteStorageError: favourites.userId === user.id && favourites.storageError }),
    [user, organisations, refreshAccount, refreshOrganisations, favouritesCatalogueReady, isScopeFavourite, toggleScopeFavourite, favourites.userId, favourites.storageError],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuthenticatedApplication() {
  const value = useContext(Context);
  if (!value) throw new Error("Authenticated application context required");
  return value;
}
