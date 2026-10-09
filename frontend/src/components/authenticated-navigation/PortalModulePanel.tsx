import { ArrowLeft, Bell, ClipboardList, Cpu, FileBarChart2, LayoutDashboard } from "lucide-react";
import type { AuthenticatedOrganisation } from "../../features/organisation-dashboard/api";
import { PORTAL_MODULES, type PortalModule } from "../../features/organisation-dashboard/authenticatedPortalRoutes";
import NavIcon from "../../common/components/icons/NavIcon";
import type { AuthenticatedRouteContext } from "./authenticatedNavigationModel";
import { PORTAL_MODULE_LABELS } from "../../features/organisation-dashboard/authenticatedPortalRoutes";

const details = {
  dashboard: { icon: LayoutDashboard },
  "event-logs": { icon: ClipboardList },
  "alarm-logs": { icon: Bell },
  "device-list": { icon: Cpu },
  reports: { icon: FileBarChart2 },
} satisfies Record<PortalModule, { icon: typeof LayoutDashboard }>;

type Props = {
  organisation: AuthenticatedOrganisation;
  siteId?: string;
  routeContext: AuthenticatedRouteContext;
  onChangeScope: () => void;
  onSelectModule: (module: PortalModule) => void;
};

export default function PortalModulePanel({ organisation, siteId, routeContext, onChangeScope, onSelectModule }: Props) {
  const scopeLabel = siteId
    ? organisation.sites.find((site) => site.id === siteId)?.name ?? "Scope unavailable"
    : "All Sites";
  return (
    <div className="authenticated-navigation__panel" role="navigation" aria-label={`${organisation.name} module navigation`}>
      <header className="authenticated-navigation__panel-header authenticated-navigation__panel-header--context">
        <button type="button" className="authenticated-navigation__back" onClick={onChangeScope} aria-label={`Change scope for ${organisation.name}`}>
          <NavIcon icon={ArrowLeft} size={18} />
        </button>
        <div className="authenticated-navigation__eyebrow" title={organisation.name}>{organisation.name}</div>
        <strong title={scopeLabel}>{scopeLabel}</strong>
      </header>
      <div className="authenticated-navigation__panel-list">
        {PORTAL_MODULES.map((module) => {
          const active = routeContext.area === "portal"
            && routeContext.organisationId === organisation.id
            && routeContext.siteId === siteId
            && routeContext.module === module;
          const detail = details[module];
          return (
            <button
              type="button"
              key={module}
              className={`authenticated-navigation__row ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectModule(module)}
            >
              <span className="authenticated-navigation__icon"><NavIcon icon={detail.icon} /></span>
              <span className="authenticated-navigation__label">{PORTAL_MODULE_LABELS[module]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
