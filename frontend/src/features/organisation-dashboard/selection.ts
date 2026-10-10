import type { OrganisationContext, Selection } from "./types";

export function resolveSelection(
  context: OrganisationContext,
  organisationSlug?: string,
  siteSlug?: string,
): Selection | null {
  if (organisationSlug !== context.organisation.slug) return null;
  if (siteSlug === undefined)
    return { scope: "organisation", id: context.organisation.id };
  const site = context.sites.find((item) => item.slug === siteSlug);
  return site ? { scope: "site", id: site.id } : null;
}

export function dashboardSearch(search: string): string {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  for (const key of ["embed", "panel", "returnTo"]) {
    const value = input.get(key);
    if (value !== null) output.set(key, value);
  }
  return output.size ? `?${output}` : "";
}

export type SiteOption = {
  id: string;
  label: string;
};

export const SITE_OPTIONS: SiteOption[] = [
  { id: "all", label: "All Sites" },
  { id: "site-a", label: "Alis Barber" },
  { id: "site-b", label: "Tokis Takeout" },
];

const STORAGE_KEY = "camOS_selected_site";

export const DEFAULT_DEMO_SITE_ID = "site-b";

export const getDefaultSiteId = (): string => DEFAULT_DEMO_SITE_ID;

export const findSiteById = (siteId?: string | null): SiteOption | undefined =>
  SITE_OPTIONS.find((site) => site.id === siteId);

export const getStoredSiteId = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  return stored || undefined;
};

export const setStoredSiteId = (siteId: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, siteId);
};

export type SiteView = "all" | "site-a" | "site-b";

const normalizeSiteToken = (
  value: string | null | undefined,
): SiteView | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "all") return "all";
  if (
    normalized === "site-a" ||
    normalized === "site_a" ||
    normalized === "sitea"
  )
    return "site-a";
  if (
    normalized === "site-b" ||
    normalized === "site_b" ||
    normalized === "siteb"
  )
    return "site-b";
  return null;
};

export const resolveSiteViewFromPathname = (
  pathname: string | null | undefined,
): SiteView | null => {
  if (!pathname) return null;
  const match = pathname.match(/^\/(?:demo|sites)\/([^/]+)(?:\/|$)/i);
  if (!match) return null;
  return normalizeSiteToken(match[1]);
};

export const resolveSiteViewOrDefault = (
  pathname: string | null | undefined,
  fallback: SiteView = "site-b",
): SiteView => {
  return resolveSiteViewFromPathname(pathname) ?? fallback;
};
