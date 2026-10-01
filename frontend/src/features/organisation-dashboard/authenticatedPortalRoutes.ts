export const PORTAL_MODULES = [
  "dashboard",
  "event-logs",
  "alarm-logs",
  "device-list",
  "reports",
] as const;

export type PortalModule = (typeof PORTAL_MODULES)[number];

export type AuthenticatedPortalLocation = {
  organisationId: string;
  siteId?: string;
  module: PortalModule;
};

const canonicalId = (value: string) => /^(0|[1-9][0-9]*)$/.test(value);

export const isPortalModule = (value: string): value is PortalModule =>
  PORTAL_MODULES.includes(value as PortalModule);

export function organisationPortalPath(organisationId: string, module: PortalModule) {
  return `/sites/organisations/${encodeURIComponent(organisationId)}/${module}`;
}

export function sitePortalPath(
  organisationId: string,
  siteId: string,
  module: PortalModule,
) {
  return `/sites/organisations/${encodeURIComponent(organisationId)}/sites/${encodeURIComponent(siteId)}/${module}`;
}

export const organisationDashboardPath = (organisationId: string) =>
  organisationPortalPath(organisationId, "dashboard");

export function parseAuthenticatedPortalPath(pathname: string): AuthenticatedPortalLocation | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "sites" || parts[1] !== "organisations" || !canonicalId(parts[2] ?? "")) {
    return null;
  }
  if (parts.length === 4 && isPortalModule(parts[3])) {
    return { organisationId: parts[2], module: parts[3] };
  }
  if (
    parts.length === 6 &&
    parts[3] === "sites" &&
    canonicalId(parts[4] ?? "") &&
    isPortalModule(parts[5])
  ) {
    return { organisationId: parts[2], siteId: parts[4], module: parts[5] };
  }
  return null;
}

export const authenticatedPortalPath = (location: AuthenticatedPortalLocation) =>
  location.siteId
    ? sitePortalPath(location.organisationId, location.siteId, location.module)
    : organisationPortalPath(location.organisationId, location.module);

export const replaceScope = (
  location: AuthenticatedPortalLocation,
  siteId?: string,
) => authenticatedPortalPath({ ...location, siteId });

export const replaceModule = (
  location: AuthenticatedPortalLocation,
  module: PortalModule,
) => authenticatedPortalPath({ ...location, module });

export const isAuthenticatedPortalPath = (pathname: string) =>
  parseAuthenticatedPortalPath(pathname) !== null;
