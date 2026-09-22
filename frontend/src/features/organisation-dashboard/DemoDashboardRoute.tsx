import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import PortalApplication from "../../components/PortalApplication";
import {
  applyDemoDefaultsOnce,
  enableDemoSession,
} from "../../lib/demoSession";
import { PortalProvider, usePortal } from "../../context/PortalContext";
import DashboardLoadingState from "./DashboardLoadingState";
import { demoPortalSource } from "./demoPortalSource";
import { dashboardSearch } from "./selection";

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
  if (!siteSlug && organisationSlug in aliases) {
    const site = context.sites.find((s) => s.id === aliases[organisationSlug]);
    if (aliases[organisationSlug] && !site)
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
