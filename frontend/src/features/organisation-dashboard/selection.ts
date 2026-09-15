import type { OrganisationContext, Selection } from "./types";

export const organisationPath = (context: OrganisationContext) =>
  `/demo/${encodeURIComponent(context.organisation.slug)}/dashboard`;
export const sitePath = (context: OrganisationContext, slug: string) =>
  `/demo/${encodeURIComponent(context.organisation.slug)}/${encodeURIComponent(slug)}/dashboard`;

export function resolveSelection(context: OrganisationContext, organisationSlug?: string, siteSlug?: string): Selection | null {
  if (organisationSlug !== context.organisation.slug) return null;
  if (siteSlug === undefined) return { scope: "organisation", id: context.organisation.id };
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
