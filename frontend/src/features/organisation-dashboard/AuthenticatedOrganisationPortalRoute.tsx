import { type PortalSource, type PortalDeviceControl, PortalProvider, responseJson } from "../../context/PortalContext";

import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import PortalModuleContent from "../../components/PortalModuleContent";

import { isPortalModule } from "./authenticatedPortalRoutes";
import { recordRecentPortalLocation } from "./recentPortalDestinations";
import AuthenticatedPortalScopeHeader from "../../components/AuthenticatedPortalScopeHeader";
import { parseSnapshot } from "./api";
import { useAuthenticatedApplication } from "../../context/AuthenticatedApplicationContext";

export default function AuthenticatedOrganisationPortalRoute() {
  const { favouritesCatalogueReady, catalogueError, refreshOrganisations, organisations } = useAuthenticatedApplication();
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
  if (!favouritesCatalogueReady) return <div className="vrm-content-loading" role={catalogueError ? "alert" : "status"}>
    {catalogueError ? <>Can't load organisations. <button className="vrm-btn" onClick={() => void refreshOrganisations().catch(() => {})}>Retry</button></> : "Loading…"}
  </div>;
  if (!organisations.some(item => item.id === organisationId)) return <div role="alert">Organisation unavailable.</div>;
  return (
    <PortalProvider
      source={source}
      organisationId={organisationId}
      siteId={siteId}
    >
      <PortalModuleContent
        module={module}
        scopeHeader={<AuthenticatedPortalScopeHeader />}
      />
    </PortalProvider>
  );
}

function authenticatedPortalSource(organisationId: string): PortalSource {
  const base = `/api/portal/organisations/${encodeURIComponent(organisationId)}`;
  const request: PortalSource["request"] = async (path, input, signal) => {
    const params = new URLSearchParams(input);
    params.delete("effective_now");
    const response = await fetch(
      `${base}${path}${params.size ? `?${params}` : ""}`,
      {
        signal,
        cache: "no-store",
        credentials: "include",
      },
    );
    if (response.status === 404 || response.status === 401)
      window.dispatchEvent(new Event("camos:refresh-access"));
    return response;
  };
  const deviceControl: PortalDeviceControl = {
    mode: "canonical",
    getOverrides: () => ({}),
    async setSourceEnabled(ref, enabled, signal) {
      const match = /^(device|gateway):([1-9][0-9]*)$/.exec(ref);
      if (!match) throw new Error("Invalid source identity.");
      const path =
        match[1] === "device"
          ? `/devices/${encodeURIComponent(match[2])}/enabled`
          : `/gateways/by-site/${encodeURIComponent(match[2])}/enabled`;
      const response = await fetch(`${base}${path}`, {
        method: "PUT",
        signal,
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
        body: JSON.stringify({ enabled }),
      });
      const body = await responseJson(response);
      return {
        ref: body.source.ref as string,
        enabled: body.source.canonical_enabled as boolean,
      };
    },
  };
  return {
    context: async (signal) =>
      responseJson(await request("/context", new URLSearchParams(), signal)),
    snapshot: async (selection, signal) => {
      const path =
        selection.scope === "organisation"
          ? "/snapshot"
          : `/sites/${encodeURIComponent(selection.id)}/snapshot`;
      return parseSnapshot(
        await responseJson(await request(path, new URLSearchParams(), signal)),
      );
    },
    request,
    deviceControl,
  };
}
