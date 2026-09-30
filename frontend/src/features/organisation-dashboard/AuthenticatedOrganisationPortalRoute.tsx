import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import PortalModuleContent from "../../components/PortalModuleContent";
import { PortalProvider } from "../../context/PortalContext";
import { authenticatedPortalSource } from "./authenticatedPortalSource";
import { isPortalModule } from "./authenticatedPortalRoutes";
import { recordRecentPortalLocation } from "./recentPortalDestinations";

export default function AuthenticatedOrganisationPortalRoute() {
  const { organisationId, siteId, module = "dashboard" } = useParams();
  const source = useMemo(
    () => authenticatedPortalSource(organisationId ?? ""),
    [organisationId],
  );
  useEffect(() => {
    if (organisationId && isPortalModule(module)) {
      recordRecentPortalLocation({ organisationId, siteId, module });
    }
  }, [organisationId, siteId, module]);
  if (!organisationId) return <div role="alert">Organisation unavailable.</div>;
  return (
    <PortalProvider source={source} organisationId={organisationId} siteId={siteId}>
      <PortalModuleContent module={module} />
    </PortalProvider>
  );
}
