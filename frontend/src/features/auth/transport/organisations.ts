export type AuthenticatedOrganisation = { id: string; name: string; role: 0 | 1 };

export async function fetchOrganisations(): Promise<AuthenticatedOrganisation[]> {
  const response = await fetch("/api/portal/organisations", { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load organisations");
  const body = await response.json() as { organisations: AuthenticatedOrganisation[] };
  return body.organisations;
}
