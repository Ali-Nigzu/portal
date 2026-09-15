import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import VRMLayout from "../../components/VRMLayout";
import { applyDemoDefaultsOnce, applyDemoEntryDefaults, enableDemoSession } from "../../lib/demoSession";
import { OrganisationDashboardProvider, useDashboardSnapshot } from "./OrganisationDashboardProvider";
import OrganisationDashboardPage from "./OrganisationDashboardPage";
import { demoDashboardSource } from "./api";
import { dashboardSearch, organisationPath } from "./selection";

function DemoDashboardShell() {
  const {context, selection} = useDashboardSnapshot();
  const {organisationSlug,siteSlug} = useParams();
  const location = useLocation();
  // Existing entry links are dashboard-only aliases; unknown real slugs never fall back.
  const legacyEntry = !siteSlug && ["site-a","site-b","all"].includes(organisationSlug ?? "");
  if (context && (!organisationSlug || (legacyEntry && organisationSlug !== context.organisation.slug))) {
    return <Navigate to={organisationPath(context)+dashboardSearch(location.search)} replace />;
  }
  const organisation = context ? {id:encodeURIComponent(context.organisation.slug),label:context.organisation.name} : {id:"",label:"Dashboard"};
  const sites = context?.sites.map(site => ({id:`${organisation.id}/${encodeURIComponent(site.slug)}`,label:site.name})) ?? [];
  const selectedSite = selection?.scope === "site" ? context?.sites.find(site => site.id === selection.id) : undefined;
  const selectedKey = selectedSite ? `${organisation.id}/${encodeURIComponent(selectedSite.slug)}` : organisation.id;
  return <VRMLayout dashboardNavigation={{organisation,sites,selectedKey,selectedLabel:selectedSite?.name ?? organisation.label}}><OrganisationDashboardPage /></VRMLayout>;
}

export default function DemoDashboardRoute() {
  const {organisationSlug,siteSlug} = useParams();
  const [ready,setReady] = useState(false);
  const [error,setError] = useState(false);
  useEffect(() => {
    let active=true;
    enableDemoSession().then(() => {
      applyDemoDefaultsOnce();
      if (!organisationSlug) applyDemoEntryDefaults();
      if(active) setReady(true);
    }).catch(() => {if(active) setError(true);});
    return () => {active=false;};
  }, []);
  if(error) return <div role="alert">Unable to start Demo. <button onClick={() => window.location.reload()}>Retry</button></div>;
  if(!ready) return <p role="status">Loading dashboard…</p>;
  return <OrganisationDashboardProvider source={demoDashboardSource} organisationSlug={organisationSlug} siteSlug={siteSlug}><DemoDashboardShell /></OrganisationDashboardProvider>;
}
