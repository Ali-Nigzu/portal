import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import type { AuthenticatedOrganisation } from "../../features/organisation-dashboard/api";
import { type ReturnTypeOfAuthenticatedNavigation, type AuthenticatedRouteContext } from "./useAuthenticatedNavigation";

import {
  FileText,
  Home,
  LogOut,
  MapPin,
  Menu,
  Settings,
  X,
  ArrowLeft,
  Bell,
  Shield,
  Plus,
  ClipboardList,
  Cpu,
  FileBarChart2,
  LayoutDashboard,
} from "lucide-react";

import {
  type PortalModule,
  PORTAL_MODULES,
  PORTAL_MODULE_LABELS,
} from "../../features/organisation-dashboard/authenticatedPortalRoutes";
import NavIcon from "../../common/components/icons/NavIcon";
import AuthenticatedPrimaryNav from "./AuthenticatedPrimaryNav";

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
  const content = (
    <span className="authenticated-navigation__compact-hit">
      <span className="authenticated-navigation__icon">{children}</span>
    </span>
  );
  const className = `authenticated-navigation__compact-cell ${active ? "is-active" : ""}`;
  if (!tapLed)
    return (
      <span className={className} title={label} aria-hidden="true">
        {content}
      </span>
    );
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

export default function AuthenticatedNavigationPod({
  organisations,
  navigation,
  onLogout,
}: Props) {
  const { state, stage, routeContext, hoverCapable } = navigation;
  const open = state.status === "open" && stage !== null;
  const contextualOrganisation =
    routeContext.area === "portal" ? routeContext.organisationId : undefined;
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
    const frame = window.requestAnimationFrame(() =>
      setPrimaryHoverEnabled(true),
    );
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
        <button
          type="button"
          className="authenticated-navigation__pod-close"
          aria-label="Close navigation"
          onClick={() => navigation.close()}
        >
          <NavIcon icon={X} size={19} />
        </button>
      </div>
      <AuthenticatedPrimaryNav
        organisations={organisations}
        routeContext={routeContext}
        stage={stage}
        hoverCapable={hoverCapable && primaryHoverEnabled}
        protectContextualSecondary={
          routeContext.area === "portal" || routeContext.area === "settings"
        }
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
        {!open && (
          <nav
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
              <span className="authenticated-navigation__icon">
                <NavIcon icon={open ? X : Menu} />
              </span>
            </button>
            <div className="authenticated-navigation__compact-destinations">
              <CompactIcon
                label="Home"
                active={activePrimary === "home"}
                tapLed={!hoverCapable}
                onOpenPrimary={navigation.openContext}
              >
                <NavIcon icon={Home} />
              </CompactIcon>
              {organisations.map((organisation) => (
                <CompactIcon
                  key={organisation.id}
                  label={organisation.name}
                  active={contextualOrganisation === organisation.id}
                  tapLed={!hoverCapable}
                  onOpenPrimary={navigation.openContext}
                >
                  <NavIcon icon={MapPin} />
                </CompactIcon>
              ))}
              <CompactIcon
                label="Documents"
                active={activePrimary === "documents"}
                tapLed={!hoverCapable}
                onOpenPrimary={navigation.openContext}
              >
                <NavIcon icon={FileText} />
              </CompactIcon>
            </div>
            <div className="authenticated-navigation__compact-utility">
              <CompactIcon
                label="Settings"
                active={activePrimary === "settings"}
                tapLed={!hoverCapable}
                onOpenPrimary={navigation.openContext}
              >
                <NavIcon icon={Settings} />
              </CompactIcon>
              <CompactIcon
                label="Logout"
                tapLed={!hoverCapable}
                onOpenPrimary={navigation.openContext}
              >
                <NavIcon icon={LogOut} />
              </CompactIcon>
            </div>
          </nav>
        )}

        {open && (
          <div
            id="authenticated-navigation-pod"
            className="authenticated-navigation__pod"
          >
            {!showPrimaryBesideSecondary && stage.kind !== "primary" && (
              <button
                type="button"
                className="authenticated-navigation__pod-close authenticated-navigation__pod-close--secondary"
                aria-label="Close navigation"
                onClick={() => navigation.close()}
              >
                <NavIcon icon={X} size={19} />
              </button>
            )}
            {(showPrimaryBesideSecondary || stage.kind === "primary") &&
              primary}
            {secondaryStage && (
              <nav
                id="authenticated-navigation-secondary"
                className="authenticated-navigation__secondary"
              >
                {secondaryStage.kind === "organisation-scopes" &&
                  stageOrganisation && (
                    <OrganisationScopePanel
                      organisation={stageOrganisation}
                      routeContext={routeContext}
                      showBack={!showPrimaryBesideSecondary}
                      onBack={navigation.showPrimary}
                      onSelect={(siteId) =>
                        navigation.selectScope(stageOrganisation.id, siteId)
                      }
                    />
                  )}
                {secondaryStage.kind === "scope-modules" &&
                  stageOrganisation && (
                    <PortalModulePanel
                      organisation={stageOrganisation}
                      siteId={secondaryStage.siteId}
                      routeContext={routeContext}
                      onChangeScope={() =>
                        navigation.showScopes(stageOrganisation.id)
                      }
                      onSelectModule={(module: PortalModule) =>
                        navigation.selectModule(
                          stageOrganisation.id,
                          secondaryStage.siteId,
                          module,
                        )
                      }
                    />
                  )}
                {secondaryStage.kind === "settings" && (
                  <AuthenticatedSettingsPanel
                    routeContext={routeContext}
                    showBack={!showPrimaryBesideSecondary}
                    onBack={navigation.showPrimary}
                    onDestination={(path) =>
                      navigation.selectDestination(
                        path === "/settings/access" && contextualOrganisation
                          ? `${path}?organisation_id=${encodeURIComponent(contextualOrganisation)}`
                          : path,
                      )
                    }
                  />
                )}
              </nav>
            )}
          </div>
        )}
      </div>
      {open && !hoverCapable && (
        <button
          type="button"
          className="authenticated-navigation__backdrop"
          aria-label="Close navigation"
          onClick={() => navigation.close()}
        />
      )}
    </>
  );
}

type SettingsPanelProps = {
  routeContext: AuthenticatedRouteContext;
  showBack: boolean;
  onBack: () => void;
  onDestination: (path: string) => void;
};

function AuthenticatedSettingsPanel({
  routeContext,
  showBack,
  onBack,
  onDestination,
}: SettingsPanelProps) {
  const section =
    routeContext.area === "settings" ? routeContext.section : undefined;
  return (
    <div
      className="authenticated-navigation__panel"
      role="navigation"
      aria-label="Settings navigation"
    >
      <header className="authenticated-navigation__panel-header">
        {showBack && (
          <button
            type="button"
            className="authenticated-navigation__back"
            onClick={onBack}
            aria-label="Back to primary navigation"
          >
            <NavIcon icon={ArrowLeft} size={18} />
            <span>Primary</span>
          </button>
        )}
        <div className="authenticated-navigation__eyebrow">Account</div>
        <strong>Settings</strong>
      </header>
      <div className="authenticated-navigation__panel-list">
        <button
          type="button"
          className={`authenticated-navigation__row ${section === "account" ? "is-active" : ""}`}
          aria-current={section === "account" ? "page" : undefined}
          onClick={() => onDestination("/settings/account")}
        >
          <span className="authenticated-navigation__icon">
            <NavIcon icon={Settings} />
          </span>
          <span className="authenticated-navigation__label">My Account</span>
        </button>
        <button
          type="button"
          className={`authenticated-navigation__row ${section === "access" ? "is-active" : ""}`}
          aria-current={section === "access" ? "page" : undefined}
          onClick={() => onDestination("/settings/access")}
        >
          <span className="authenticated-navigation__icon">
            <NavIcon icon={Shield} />
          </span>
          <span className="authenticated-navigation__label">Manage Access</span>
        </button>
        <button
          type="button"
          className="authenticated-navigation__row authenticated-navigation__row--disabled"
          aria-disabled="true"
          disabled
        >
          <span className="authenticated-navigation__icon">
            <NavIcon icon={Bell} />
          </span>
          <span className="authenticated-navigation__label">Create Alarm</span>
        </button>
      </div>
    </div>
  );
}

type ScopePanelProps = {
  organisation: AuthenticatedOrganisation;
  routeContext: AuthenticatedRouteContext;
  showBack: boolean;
  onBack: () => void;
  onSelect: (siteId?: string) => void;
};

function OrganisationScopePanel({
  organisation,
  routeContext,
  showBack,
  onBack,
  onSelect,
}: ScopePanelProps) {
  const routeMatchesOrganisation =
    routeContext.area === "portal" &&
    routeContext.organisationId === organisation.id;
  return (
    <div
      className="authenticated-navigation__panel"
      role="navigation"
      aria-label={`${organisation.name} scope selector`}
    >
      <header className="authenticated-navigation__panel-header">
        {showBack && (
          <button
            type="button"
            className="authenticated-navigation__back"
            onClick={onBack}
            aria-label="Back to primary navigation"
          >
            <NavIcon icon={ArrowLeft} size={18} />
            <span>Primary</span>
          </button>
        )}
        <strong title={organisation.name}>{organisation.name}</strong>
      </header>
      <div className="authenticated-navigation__panel-list">
        <button
          type="button"
          className={`authenticated-navigation__row ${routeMatchesOrganisation && !routeContext.siteId ? "is-active" : ""}`}
          aria-current={
            routeMatchesOrganisation && !routeContext.siteId
              ? "location"
              : undefined
          }
          onClick={() => onSelect()}
        >
          <span className="authenticated-navigation__icon">
            <NavIcon icon={MapPin} />
          </span>
          <span className="authenticated-navigation__label">All Sites</span>
        </button>
        <div
          className="authenticated-navigation__scope-divider"
          aria-hidden="true"
        />
        {organisation.sites.map((site) => {
          const active =
            routeMatchesOrganisation && routeContext.siteId === site.id;
          return (
            <button
              type="button"
              key={site.id}
              className={`authenticated-navigation__row ${active ? "is-active" : ""}`}
              aria-current={active ? "location" : undefined}
              title={site.name}
              onClick={() => onSelect(site.id)}
            >
              <span className="authenticated-navigation__icon">
                <NavIcon icon={MapPin} />
              </span>
              <span className="authenticated-navigation__label">
                {site.name}
              </span>
            </button>
          );
        })}
        <a
          className="authenticated-navigation__row authenticated-navigation__row--external-action"
          href="https://calendly.com/cameraoperatingsystems/camos-site-setup-appointment"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="authenticated-navigation__icon">
            <NavIcon icon={Plus} />
          </span>
          <span className="authenticated-navigation__label">Add Site</span>
        </a>
      </div>
    </div>
  );
}

const details = {
  dashboard: { icon: LayoutDashboard },
  "event-logs": { icon: ClipboardList },
  "alarm-logs": { icon: Bell },
  "device-list": { icon: Cpu },
  reports: { icon: FileBarChart2 },
} satisfies Record<PortalModule, { icon: typeof LayoutDashboard }>;

type ModulePanelProps = {
  organisation: AuthenticatedOrganisation;
  siteId?: string;
  routeContext: AuthenticatedRouteContext;
  onChangeScope: () => void;
  onSelectModule: (module: PortalModule) => void;
};

function PortalModulePanel({
  organisation,
  siteId,
  routeContext,
  onChangeScope,
  onSelectModule,
}: ModulePanelProps) {
  const scopeLabel = siteId
    ? (organisation.sites.find((site) => site.id === siteId)?.name ??
      "Scope unavailable")
    : "All Sites";
  return (
    <div
      className="authenticated-navigation__panel"
      role="navigation"
      aria-label={`${organisation.name} module navigation`}
    >
      <header className="authenticated-navigation__panel-header authenticated-navigation__panel-header--context">
        <button
          type="button"
          className="authenticated-navigation__back"
          onClick={onChangeScope}
          aria-label={`Change scope for ${organisation.name}`}
        >
          <NavIcon icon={ArrowLeft} size={18} />
        </button>
        <div
          className="authenticated-navigation__eyebrow"
          title={organisation.name}
        >
          {organisation.name}
        </div>
        <strong title={scopeLabel}>{scopeLabel}</strong>
      </header>
      <div className="authenticated-navigation__panel-list">
        {PORTAL_MODULES.map((module) => {
          const active =
            routeContext.area === "portal" &&
            routeContext.organisationId === organisation.id &&
            routeContext.siteId === siteId &&
            routeContext.module === module;
          const detail = details[module];
          return (
            <button
              type="button"
              key={module}
              className={`authenticated-navigation__row ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectModule(module)}
            >
              <span className="authenticated-navigation__icon">
                <NavIcon icon={detail.icon} />
              </span>
              <span className="authenticated-navigation__label">
                {PORTAL_MODULE_LABELS[module]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
