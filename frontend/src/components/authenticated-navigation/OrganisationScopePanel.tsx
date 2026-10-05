import { ArrowLeft, MapPin } from "lucide-react";
import type { AuthenticatedOrganisation } from "../../features/auth/transport/organisations";
import { NavIcon } from "../../common/components/icons";
import type { AuthenticatedRouteContext } from "./authenticatedNavigationModel";

type Props = {
  organisation: AuthenticatedOrganisation;
  routeContext: AuthenticatedRouteContext;
  showBack: boolean;
  onBack: () => void;
  onSelect: (siteId?: string) => void;
};

export default function OrganisationScopePanel({ organisation, routeContext, showBack, onBack, onSelect }: Props) {
  const routeMatchesOrganisation = routeContext.area === "portal" && routeContext.organisationId === organisation.id;
  return (
    <div className="authenticated-navigation__panel" role="navigation" aria-label={`${organisation.name} scope selector`}>
      <header className="authenticated-navigation__panel-header">
        {showBack && (
          <button type="button" className="authenticated-navigation__back" onClick={onBack} aria-label="Back to primary navigation">
            <NavIcon icon={ArrowLeft} size={18} />
            <span>Primary</span>
          </button>
        )}
        <div className="authenticated-navigation__eyebrow">Organisation</div>
        <strong title={organisation.name}>{organisation.name}</strong>
      </header>
      <div className="authenticated-navigation__panel-list">
        <button
          type="button"
          className={`authenticated-navigation__row ${routeMatchesOrganisation && !routeContext.siteId ? "is-active" : ""}`}
          aria-current={routeMatchesOrganisation && !routeContext.siteId ? "location" : undefined}
          onClick={() => onSelect()}
        >
          <span className="authenticated-navigation__icon"><NavIcon icon={MapPin} /></span>
          <span className="authenticated-navigation__label">All Sites</span>
        </button>
        {organisation.sites.map((site) => {
          const active = routeMatchesOrganisation && routeContext.siteId === site.id;
          return (
            <button
              type="button"
              key={site.id}
              className={`authenticated-navigation__row ${active ? "is-active" : ""}`}
              aria-current={active ? "location" : undefined}
              title={site.name}
              onClick={() => onSelect(site.id)}
            >
              <span className="authenticated-navigation__icon"><NavIcon icon={MapPin} /></span>
              <span className="authenticated-navigation__label">{site.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
