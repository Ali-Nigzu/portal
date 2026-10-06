import { createContext, useContext, useMemo, useState, useEffect, useCallback, type ReactNode } from "react";
import type { AuthUser } from "../features/auth/transport/me";
import type { AuthenticatedOrganisation } from "../features/auth/transport/organisations";

type AuthenticatedApplicationInput = {
  user: AuthUser;
  organisations: AuthenticatedOrganisation[];
  refreshOrganisations: () => Promise<void>;
};

export const favouriteScopeKey = (organisationId: string, siteId?: string) =>
  `${organisationId}:${siteId === undefined ? `organisation:${organisationId}` : `site:${siteId}`}`;

type AuthenticatedApplicationValue = AuthenticatedApplicationInput & {
  isScopeFavourite: (organisationId: string, siteId?: string) => boolean;
  toggleScopeFavourite: (organisationId: string, siteId?: string) => void;
};

const Context = createContext<AuthenticatedApplicationValue | null>(null);

export function AuthenticatedApplicationProvider({
  user,
  organisations,
  refreshOrganisations,
  children,
}: AuthenticatedApplicationInput & { children: ReactNode }) {
  const [favourites, setFavourites] = useState(() => ({ userId: user.id, keys: new Set<string>() }));
  const validKeys = useMemo(() => new Set(organisations.flatMap(organisation => [
    favouriteScopeKey(organisation.id),
    ...organisation.sites.map(site => favouriteScopeKey(organisation.id, site.id)),
  ])), [organisations]);
  useEffect(() => {
    setFavourites(previous => {
      if (previous.userId !== user.id) return { userId: user.id, keys: new Set<string>() };
      const keys = new Set([...previous.keys].filter(key => validKeys.has(key)));
      return keys.size === previous.keys.size ? previous : { userId: user.id, keys };
    });
  }, [user.id, validKeys]);
  const isScopeFavourite = useCallback((organisationId: string, siteId?: string) => {
    const key = favouriteScopeKey(organisationId, siteId);
    return favourites.userId === user.id && validKeys.has(key) && favourites.keys.has(key);
  }, [favourites, user.id, validKeys]);
  const toggleScopeFavourite = useCallback((organisationId: string, siteId?: string) => {
    const key = favouriteScopeKey(organisationId, siteId);
    if (!validKeys.has(key)) return;
    setFavourites(previous => {
      const keys = new Set(previous.userId === user.id ? [...previous.keys].filter(value => validKeys.has(value)) : []);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      return { userId: user.id, keys };
    });
  }, [user.id, validKeys]);
  const value = useMemo(
    () => ({ user, organisations, refreshOrganisations, isScopeFavourite, toggleScopeFavourite }),
    [user, organisations, refreshOrganisations, isScopeFavourite, toggleScopeFavourite],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuthenticatedApplication() {
  const value = useContext(Context);
  if (!value) throw new Error("Authenticated application context required");
  return value;
}
