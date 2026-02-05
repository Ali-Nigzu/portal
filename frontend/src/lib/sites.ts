export type SiteOption = {
  id: string;
  label: string;
};

export const SITE_OPTIONS: SiteOption[] = [
  { id: "all", label: "All Sites" },
  { id: "site-a", label: "Site A" },
  { id: "site-b", label: "Site B" },
];

const STORAGE_KEY = "camOS_selected_site";

export const getDefaultSiteId = (): string => "site-a";

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
