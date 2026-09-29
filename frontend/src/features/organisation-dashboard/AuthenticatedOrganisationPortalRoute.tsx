import { useMemo } from "react";
import { useParams } from "react-router-dom";
import PortalApplication from "../../components/PortalApplication";
import { PortalProvider } from "../../context/PortalContext";
import { authenticatedPortalSource } from "./authenticatedPortalSource";

export type AuthenticatedOrganisation = { id: string; name: string; role: 0 | 1 };

export default function AuthenticatedOrganisationPortalRoute({
  organisations,
  onLogout,
}: {
  organisations: AuthenticatedOrganisation[];
  onLogout: () => void;
}) {
  const { organisationId, siteId, module = "dashboard" } = useParams();
  const source = useMemo(
    () => authenticatedPortalSource(organisationId ?? ""),
    [organisationId],
  );
  if (!organisationId) return <div role="alert">Organisation unavailable.</div>;
  return (
    <PortalProvider source={source} organisationId={organisationId} siteId={siteId}>
      <PortalApplication
        module={module}
        authenticated
        authenticatedOrganisations={organisations}
        onLogout={onLogout}
        pathForOrganisation={(id) => `/sites/organisations/${encodeURIComponent(id)}`}
        pathForSite={(organisation, site) => `/sites/organisations/${encodeURIComponent(organisation)}/sites/${encodeURIComponent(site)}`}
      />
    </PortalProvider>
  );
}
