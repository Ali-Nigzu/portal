import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AuthUser } from "../features/auth/transport/me";
import type { AuthenticatedOrganisation } from "../features/auth/transport/organisations";

type AuthenticatedApplicationValue = {
  user: AuthUser;
  organisations: AuthenticatedOrganisation[];
  refreshOrganisations: () => Promise<void>;
};

const Context = createContext<AuthenticatedApplicationValue | null>(null);

export function AuthenticatedApplicationProvider({
  user,
  organisations,
  refreshOrganisations,
  children,
}: AuthenticatedApplicationValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ user, organisations, refreshOrganisations }),
    [user, organisations, refreshOrganisations],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuthenticatedApplication() {
  const value = useContext(Context);
  if (!value) throw new Error("Authenticated application context required");
  return value;
}
