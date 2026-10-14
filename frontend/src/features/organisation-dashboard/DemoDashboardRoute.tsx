import { requestFetch } from "../auth/transport/me";
import { type PortalSource, PortalProvider, usePortal, responseJson } from "../../context/PortalContext";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import VRMLayout from "../../components/VRMLayout";
import PortalModuleContent, {
  DashboardLoadingState,
} from "../../components/PortalModuleContent";
import { applyDemoDefaultsOnce, enableDemoSession, demoDeviceControl } from "./demoSession";

import { dashboardSearch } from "./selection";

import { demoDashboardSource } from "./api";

function PortalApplication({ module }: { module: string }) {
  const { context, selection } = usePortal();
  if (!context) return null;
  if (!selection) return <div role="alert">Portal page not found.</div>;
  const organisation = {
    id: encodeURIComponent(context.organisation.slug),
    label: context.organisation.name,
  };
  const sites = context.sites.map((s) => ({
    id: `${organisation.id}/${encodeURIComponent(s.slug)}`,
    label: s.name,
  }));
  const site =
    selection.scope === "site"
      ? context.sites.find((s) => s.id === selection.id)
      : undefined;
  const selectedKey = site
    ? `${organisation.id}/${encodeURIComponent(site.slug)}`
    : organisation.id;
  return (
    <VRMLayout
      dashboardNavigation={{
        organisation,
        sites,
        selectedKey,
        selectedLabel: site?.name ?? organisation.label,
      }}
    >
      <PortalModuleContent module={module} />
    </VRMLayout>
  );
}

function PortalShell() {
  const { context, error, retry } = usePortal();
  const { organisationSlug, siteSlug, module = "dashboard" } = useParams();
  const location = useLocation();
  if (error)
    return (
      <div role="alert">
        {error}
        <button onClick={retry}>Retry</button>
      </div>
    );
  if (!context) return <DashboardLoadingState label="Loading live demo…" />;
  const root = `/demo/${encodeURIComponent(context.organisation.slug)}`;
  if (!organisationSlug) {
    const initial = context.sites.find((s) => s.id === "2");
    if (!initial)
      return (
        <div role="alert">
          Demo is unavailable: the configured default site is missing.
          <button onClick={retry}>Retry</button>
        </div>
      );
    return (
      <Navigate
        replace
        to={`${root}/${encodeURIComponent(initial.slug)}/dashboard${dashboardSearch(location.search)}`}
      />
    );
  }
  const aliases: Record<string, string | null> = {
    "site-a": "1",
    "site-b": "2",
    all: null,
  };
  const selectedSiteId =
    organisationSlug in aliases
      ? aliases[organisationSlug]
      : context.sites.find((site) => site.id === organisationSlug)?.id;
  if (!siteSlug && selectedSiteId !== undefined) {
    const site = context.sites.find((s) => s.id === selectedSiteId);
    if (selectedSiteId && !site)
      return <div role="alert">Site unavailable.</div>;
    return (
      <Navigate
        replace
        to={`${root}${site ? `/${encodeURIComponent(site.slug)}` : ""}/${module}${dashboardSearch(location.search)}`}
      />
    );
  }
  return <PortalApplication module={module} />;
}
export default function DemoDashboardRoute() {
  const { organisationSlug, siteSlug } = useParams();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    enableDemoSession()
      .then(() => {
        applyDemoDefaultsOnce();
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <div role="alert">
        Unable to start Demo.{" "}
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  if (!ready) return <DashboardLoadingState label="Loading live demo…" />;
  return (
    <PortalProvider
      source={demoPortalSource}
      organisationSlug={organisationSlug}
      siteSlug={siteSlug}
    >
      <PortalShell />
    </PortalProvider>
  );
}

const request: PortalSource["request"] = (path, params, signal) =>
  requestFetch(`/api/demo/portal${path}${params.size ? `?${params}` : ""}`, {
    signal,
    cache: "no-store",
    credentials: "include",
  }, 12_000);
const demoPortalSource: PortalSource = {
  context: async (signal) =>
    responseJson(await request("/context", new URLSearchParams(), signal)),
  snapshot: demoDashboardSource.snapshot,
  request,
  deviceControl: demoDeviceControl,
};
