export type SiteView = "all" | "site-a" | "site-b";

const normalizeSiteToken = (value: string | null | undefined): SiteView | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "site-a" || normalized === "site_a" || normalized === "sitea") return "site-a";
  if (normalized === "site-b" || normalized === "site_b" || normalized === "siteb") return "site-b";
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

export const resolveSiteViewFromLocation = (): SiteView | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return resolveSiteViewFromPathname(window.location.pathname);
};
