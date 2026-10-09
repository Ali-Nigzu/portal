import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { FileText, Home, LogOut, MapPin, Menu, Settings, X } from "lucide-react";
import type { AuthenticatedOrganisation } from "../../features/organisation-dashboard/api";
import type { PortalModule } from "../../features/organisation-dashboard/authenticatedPortalRoutes";
import NavIcon from "../../common/components/icons/NavIcon";
import AuthenticatedPrimaryNav from "./AuthenticatedPrimaryNav";
import OrganisationScopePanel from "./OrganisationScopePanel";
import PortalModulePanel from "./PortalModulePanel";
import AuthenticatedSettingsPanel from "./AuthenticatedSettingsPanel";
import type { ReturnTypeOfAuthenticatedNavigation } from "./useAuthenticatedNavigation";

type Props = {
  organisations: AuthenticatedOrganisation[];
  navigation: ReturnTypeOfAuthenticatedNavigation;
  onLogout: () => void | Promise<void>;
};

const CompactIcon = ({
  label,
  active,
  children,
  tapLed,
  onOpenPrimary,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
  tapLed: boolean;
  onOpenPrimary: () => void;
}) => {
  const content = <span className="authenticated-navigation__compact-hit"><span className="authenticated-navigation__icon">{children}</span></span>;
  const className = `authenticated-navigation__compact-cell ${active ? "is-active" : ""}`;
  if (!tapLed) return <span className={className} title={label} aria-hidden="true">{content}</span>;
  return (
    <button
      type="button"
      className={`${className} authenticated-navigation__compact-action`}
      aria-label={`Open primary navigation from ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpenPrimary();
      }}
    >
      {content}
    </button>
  );
};

export default function AuthenticatedNavigationPod({ organisations, navigation, onLogout }: Props) {
  const { state, stage, routeContext, hoverCapable } = navigation;
  const open = state.status === "open" && stage !== null;
  const contextualOrganisation = routeContext.area === "portal" ? routeContext.organisationId : undefined;
  const showPrimaryBesideSecondary = hoverCapable;
  const secondaryStage = stage?.kind !== "primary" ? stage : null;
  const stageOrganisation = navigation.stageOrganisation;
  const activePrimary = routeContext.area;
  const [primaryHoverEnabled, setPrimaryHoverEnabled] = useState(false);

  useEffect(() => {
    if (!open || !hoverCapable) {
      setPrimaryHoverEnabled(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setPrimaryHoverEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [hoverCapable, open]);

  const handleLogout = async () => {
    navigation.close();
    await onLogout();
  };

  const handleTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!hoverCapable && !open) navigation.openContext();
    else navigation.toggle();
  };

  const primary = stage && (
    <nav className="authenticated-navigation__primary" aria-label="Primary">
      <div className="authenticated-navigation__brand-row">
        <strong>camOS</strong>
        <button type="button" className="authenticated-navigation__pod-close" aria-label="Close navigation" onClick={() => navigation.close()}>
          <NavIcon icon={X} size={19} />
        </button>
      </div>
      <AuthenticatedPrimaryNav
        organisations={organisations}
        routeContext={routeContext}
        stage={stage}
        hoverCapable={hoverCapable && primaryHoverEnabled}
        protectContextualSecondary={routeContext.area === "portal" || routeContext.area === "settings"}
        onShowPrimary={navigation.showPrimary}
        onShowScopes={navigation.showScopes}
        onShowSettings={navigation.showSettings}
        onDestination={navigation.selectDestination}
        onLogout={handleLogout}
      />
    </nav>
  );

  return (
    <>
      <div
        ref={navigation.rootRef}
        className={`authenticated-navigation ${open ? "is-open" : ""} ${hoverCapable ? "is-hover-led" : "is-tap-led"}`}
        onPointerEnter={() => {
          navigation.cancelClose();
          if (hoverCapable && !open) {
            setPrimaryHoverEnabled(false);
            navigation.openContext();
          }
        }}
        onPointerLeave={navigation.scheduleClose}
        onFocusCapture={() => {
          setPrimaryHoverEnabled(true);
          navigation.handleFocusCapture();
        }}
      >
        {!open && <nav
          className="authenticated-navigation__rail"
          aria-label="Authenticated navigation"
          onClick={() => {
            if (!hoverCapable) navigation.openContext();
          }}
        >
          <button
            ref={navigation.triggerRef}
            type="button"
            className="authenticated-navigation__rail-trigger authenticated-navigation__compact-hit"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="authenticated-navigation-pod"
            onPointerDown={navigation.preparePointerFocus}
            onClick={handleTriggerClick}
          >
            <span className="authenticated-navigation__icon"><NavIcon icon={open ? X : Menu} /></span>
          </button>
          <div className="authenticated-navigation__compact-destinations">
            <CompactIcon label="Home" active={activePrimary === "home"} tapLed={!hoverCapable} onOpenPrimary={navigation.openContext}><NavIcon icon={Home} /></CompactIcon>
            {organisations.map((organisation) => (
              <CompactIcon key={organisation.id} label={organisation.name} active={contextualOrganisation === organisation.id} tapLed={!hoverCapable} onOpenPrimary={navigation.openContext}><NavIcon icon={MapPin} /></CompactIcon>
            ))}
            <CompactIcon label="Documents" active={activePrimary === "documents"} tapLed={!hoverCapable} onOpenPrimary={navigation.openContext}><NavIcon icon={FileText} /></CompactIcon>
          </div>
          <div className="authenticated-navigation__compact-utility">
            <CompactIcon label="Settings" active={activePrimary === "settings"} tapLed={!hoverCapable} onOpenPrimary={navigation.openContext}><NavIcon icon={Settings} /></CompactIcon>
            <CompactIcon label="Logout" tapLed={!hoverCapable} onOpenPrimary={navigation.openContext}><NavIcon icon={LogOut} /></CompactIcon>
          </div>
        </nav>}

        {open && (
          <div id="authenticated-navigation-pod" className="authenticated-navigation__pod">
            {!showPrimaryBesideSecondary && stage.kind !== "primary" && (
              <button type="button" className="authenticated-navigation__pod-close authenticated-navigation__pod-close--secondary" aria-label="Close navigation" onClick={() => navigation.close()}>
                <NavIcon icon={X} size={19} />
              </button>
            )}
            {(showPrimaryBesideSecondary || stage.kind === "primary") && primary}
            {secondaryStage && (
              <nav id="authenticated-navigation-secondary" className="authenticated-navigation__secondary">
                {secondaryStage.kind === "organisation-scopes" && stageOrganisation && (
                  <OrganisationScopePanel
                    organisation={stageOrganisation}
                    routeContext={routeContext}
                    showBack={!showPrimaryBesideSecondary}
                    onBack={navigation.showPrimary}
                    onSelect={(siteId) => navigation.selectScope(stageOrganisation.id, siteId)}
                  />
                )}
                {secondaryStage.kind === "scope-modules" && stageOrganisation && (
                  <PortalModulePanel
                    organisation={stageOrganisation}
                    siteId={secondaryStage.siteId}
                    routeContext={routeContext}
                    onChangeScope={() => navigation.showScopes(stageOrganisation.id)}
                    onSelectModule={(module: PortalModule) => navigation.selectModule(stageOrganisation.id, secondaryStage.siteId, module)}
                  />
                )}
                {secondaryStage.kind === "settings" && (
                  <AuthenticatedSettingsPanel
                    routeContext={routeContext}
                    showBack={!showPrimaryBesideSecondary}
                    onBack={navigation.showPrimary}
                    onDestination={(path) => navigation.selectDestination(path === "/settings/access" && contextualOrganisation
                      ? `${path}?organisation_id=${encodeURIComponent(contextualOrganisation)}` : path)}
                  />
                )}
              </nav>
            )}
          </div>
        )}
      </div>
      {open && !hoverCapable && <button type="button" className="authenticated-navigation__backdrop" aria-label="Close navigation" onClick={() => navigation.close()} />}
    </>
  );
}
