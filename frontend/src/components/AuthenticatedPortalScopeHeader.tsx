import { Star } from "lucide-react";
import { useAuthenticatedApplication } from "../context/AuthenticatedApplicationContext";
import { usePortal } from "../context/PortalContext";
import DashboardHeader from "../features/dashboard/components/DashboardHeader";
import { NavIcon } from "../common/components/icons";
import "../features/dashboard/styles/DashboardPage.css";
import "../styles/AuthenticatedPortalScopeHeader.css";

export default function AuthenticatedPortalScopeHeader() {
  const { context, selection } = usePortal();
  const { isScopeFavourite, toggleScopeFavourite, favouriteStorageError } = useAuthenticatedApplication();
  if (!context || !selection) return null;
  const siteId = selection.scope === "site" ? selection.id : undefined;
  const entity = siteId === undefined ? context.organisation : context.sites.find(site => site.id === siteId);
  if (!entity) return null;
  const label = siteId === undefined ? "All Sites" : entity.name;
  const favourite = isScopeFavourite(context.organisation.id, siteId);
  const control = <button
    type="button"
    className={`authenticated-portal-favourite${favourite ? " is-favourite" : ""}`}
    aria-pressed={favourite}
    aria-label={`${favourite ? "Remove" : "Add"} ${label} ${favourite ? "from" : "to"} favourites`}
    onClick={event => {
      event.stopPropagation();
      toggleScopeFavourite(context.organisation.id, siteId);
    }}
  ><NavIcon icon={Star} size={16} /></button>;
  return <div className="authenticated-portal-scope-header" data-testid="portal-scope-header">
    {favouriteStorageError && <span className="authenticated-portal-favourite-warning" role="status">Couldn’t save favourites in this browser.</span>}
    <DashboardHeader siteLabelOverride={label} status={{ enabled: entity.enabled, realtime: entity.realtime }} metadataAction={control} />
  </div>;
}
