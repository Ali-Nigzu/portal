import type { ReactNode } from "react";
import { ChevronRight, FileText, Home, LogOut, MapPin, Settings, Plus, UserPlus } from "lucide-react";
import { useOrganisationAccess } from "../../features/organisation-access/OrganisationAccessContext";
import type { AuthenticatedOrganisation } from "../../features/auth/transport/organisations";
import { NavIcon } from "../../common/components/icons";
import type { AuthenticatedRouteContext, NavigationStage } from "./authenticatedNavigationModel";

type PrimaryRowProps = {
  label: string;
  icon: ReactNode;
  active?: boolean;
  expanded?: boolean;
  title?: string;
  ownsPanel?: boolean;
  onPointerEnter?: () => void;
  onClick: () => void;
};

const PrimaryRow = ({ label, icon, active, expanded, title, ownsPanel, onPointerEnter, onClick }: PrimaryRowProps) => (
  <button
    type="button"
    className={`authenticated-navigation__row ${active ? "is-route-context" : ""} ${expanded ? "is-open-owner" : ""}`}
    title={title}
    aria-expanded={ownsPanel ? Boolean(expanded) : undefined}
    aria-controls={ownsPanel ? "authenticated-navigation-secondary" : undefined}
    aria-current={active && !ownsPanel ? "page" : undefined}
    onPointerEnter={onPointerEnter}
    onFocus={onPointerEnter}
    onClick={onClick}
  >
    <span className="authenticated-navigation__icon">{icon}</span>
    <span className="authenticated-navigation__label">{label}</span>
    {ownsPanel && <span className="authenticated-navigation__chevron"><NavIcon icon={ChevronRight} size={17} /></span>}
  </button>
);

type Props = {
  organisations: AuthenticatedOrganisation[];
  routeContext: AuthenticatedRouteContext;
  stage: NavigationStage;
  hoverCapable: boolean;
  protectContextualSecondary: boolean;
  onShowPrimary: () => void;
  onShowScopes: (organisationId: string) => void;
  onShowSettings: () => void;
  onDestination: (path: string) => void;
  onLogout: () => void;
};

export default function AuthenticatedPrimaryNav({
  organisations,
  routeContext,
  stage,
  hoverCapable,
  protectContextualSecondary,
  onShowPrimary,
  onShowScopes,
  onShowSettings,
  onDestination,
  onLogout,
}: Props) {
  const { pending, openCreate, openRequest } = useOrganisationAccess();
  const stageOrganisationId = stage.kind === "organisation-scopes" || stage.kind === "scope-modules"
    ? stage.organisationId
    : undefined;
  const allowHoverPreview = hoverCapable && !protectContextualSecondary;
  const clearSecondary = () => { if (allowHoverPreview) onShowPrimary(); };

  return (
    <div className="authenticated-navigation__primary-list" aria-label="Primary destinations">
      <PrimaryRow
        label="Home"
        icon={<NavIcon icon={Home} />}
        active={routeContext.area === "home"}
        onPointerEnter={clearSecondary}
        onClick={() => onDestination("/home")}
      />
      {organisations.map((organisation) => (
        <PrimaryRow
          key={organisation.id}
          label={organisation.name}
          title={organisation.name}
          icon={<NavIcon icon={MapPin} />}
          active={routeContext.area === "portal" && routeContext.organisationId === organisation.id}
          expanded={stageOrganisationId === organisation.id}
          ownsPanel
          onPointerEnter={() => { if (allowHoverPreview) onShowScopes(organisation.id); }}
          onClick={() => onShowScopes(organisation.id)}
        />
      ))}
      <PrimaryRow label="Add Organisation" icon={<NavIcon icon={Plus} />} onPointerEnter={clearSecondary} onClick={openCreate} />
      <PrimaryRow label="Request Access" icon={<NavIcon icon={UserPlus} />} onPointerEnter={clearSecondary} onClick={openRequest} />
      {pending.invitations.length > 0 && <div className="authenticated-navigation__pending-group" aria-label="Invitations">
        <span className="authenticated-navigation__section-label">Invitations</span>
        {pending.invitations.map(item => <button key={item.organisation_id} type="button" className="authenticated-navigation__row authenticated-navigation__pending-row"
          onClick={() => onDestination("/settings/access#personal-access")} title={item.organisation_name}>
          <span className="authenticated-navigation__label">{item.organisation_name}</span><span className="authenticated-navigation__pending-label">Invited</span>
        </button>)}
      </div>}
      {pending.requests.length > 0 && <div className="authenticated-navigation__pending-group" aria-label="Requests">
        <span className="authenticated-navigation__section-label">Requests</span>
        {pending.requests.map(item => <button key={item.organisation_id} type="button" className="authenticated-navigation__row authenticated-navigation__pending-row"
          onClick={() => onDestination("/settings/access#personal-access")} title={item.organisation_name}>
          <span className="authenticated-navigation__label">{item.organisation_name}</span><span className="authenticated-navigation__pending-label">Pending</span>
        </button>)}
      </div>}
      <PrimaryRow
        label="Documents"
        icon={<NavIcon icon={FileText} />}
        active={routeContext.area === "documents"}
        onPointerEnter={clearSecondary}
        onClick={() => onDestination("/documents")}
      />
      <div className="authenticated-navigation__utility-group">
        <PrimaryRow
          label="Settings"
          icon={<NavIcon icon={Settings} />}
          active={routeContext.area === "settings"}
          expanded={stage.kind === "settings"}
          ownsPanel
          onPointerEnter={() => { if (allowHoverPreview) onShowSettings(); }}
          onClick={onShowSettings}
        />
        <PrimaryRow
          label="Logout"
          icon={<NavIcon icon={LogOut} />}
          onPointerEnter={clearSecondary}
          onClick={onLogout}
        />
      </div>
    </div>
  );
}
