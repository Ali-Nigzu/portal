import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Bell, ChevronRight, ClipboardList, Cpu, FileBarChart2, FileText,
  Home, LayoutDashboard, LogOut, MapPin, Settings,
} from "lucide-react";
import { logout } from "../features/auth/transport/me";
import type { AuthenticatedOrganisation } from "../features/auth/transport/organisations";
import {
  PORTAL_MODULES,
  authenticatedPortalPath,
  parseAuthenticatedPortalPath,
  type PortalModule,
} from "../features/organisation-dashboard/authenticatedPortalRoutes";
import { NavIcon } from "../common/components/icons";
import { NavList, NavRow, SecondaryDivider, SecondaryPinnedRow } from "../common/components/navigation";
import MobileSidebarRow from "./MobileSidebarRow";
import SettingsSecondaryNav from "../features/settings/components/SettingsSecondaryNav";
import camOSLogo from "../assets/Untitled design (4).svg";
import "../styles/VRMTheme.css";
import "../styles/VRMNavigation.css";

const moduleDetails: Record<PortalModule, { label: string; icon: ReactNode }> = {
  dashboard: { label: "Dashboard", icon: <NavIcon icon={LayoutDashboard} /> },
  "event-logs": { label: "Event Logs", icon: <NavIcon icon={ClipboardList} /> },
  "alarm-logs": { label: "Alarm Logs", icon: <NavIcon icon={Bell} /> },
  "device-list": { label: "Device List", icon: <NavIcon icon={Cpu} /> },
  reports: { label: "Reports", icon: <NavIcon icon={FileBarChart2} /> },
};

export default function AuthenticatedVRMLayout({
  organisations,
  onLogout,
  children,
}: {
  organisations: AuthenticatedOrganisation[];
  onLogout?: () => void;
  children?: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = useMemo(() => parseAuthenticatedPortalPath(location.pathname), [location.pathname]);
  const [openScopeOrganisationId, setOpenScopeOrganisationId] = useState<string | null>(null);
  const [selectorPinned, setSelectorPinned] = useState(false);
  const selectorPinnedRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<"closed" | "primary" | "secondary">("closed");
  const closeTimer = useRef<number | null>(null);
  const secondaryPanelRef = useRef<HTMLElement | null>(null);
  const organisationButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectorOrganisation = organisations.find((organisation) => organisation.id === openScopeOrganisationId);
  const activeOrganisation = organisations.find((organisation) => organisation.id === active?.organisationId);
  const isSettings = location.pathname.startsWith("/settings");
  const secondaryMode = selectorOrganisation
    ? "scope-selector"
    : active && activeOrganisation
      ? "modules"
      : isSettings
        ? "settings"
        : "closed";
  const showSecondary = secondaryMode !== "closed";

  useEffect(() => {
    selectorPinnedRef.current = selectorPinned;
  }, [selectorPinned]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px), ((max-width: 1024px) and (hover: none) and (pointer: coarse))");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (active && !activeOrganisation) navigate("/home", { replace: true });
  }, [active, activeOrganisation, navigate]);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      if (!selectorPinnedRef.current) setOpenScopeOrganisationId(null);
    }, 180);
  };
  useEffect(() => () => cancelClose(), []);

  const openScopeSelector = (organisationId: string, pinned: boolean) => {
    cancelClose();
    selectorPinnedRef.current = pinned;
    setSelectorPinned(pinned);
    setOpenScopeOrganisationId(organisationId);
    if (isMobile) setMobileDrawer("secondary");
  };

  const closeScopeSelector = (restoreFocus = false) => {
    const organisationId = openScopeOrganisationId;
    cancelClose();
    selectorPinnedRef.current = false;
    setSelectorPinned(false);
    setOpenScopeOrganisationId(null);
    if (isMobile) setMobileDrawer("closed");
    if (restoreFocus && organisationId) organisationButtonRefs.current.get(organisationId)?.focus();
  };

  useEffect(() => {
    if (!selectorPinned) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || secondaryPanelRef.current?.contains(target)) return;
      if ([...organisationButtonRefs.current.values()].some((button) => button.contains(target))) return;
      closeScopeSelector();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [selectorPinned, openScopeOrganisationId, isMobile]);

  const selectScope = (siteId?: string) => {
    if (!selectorOrganisation) return;
    const module = active?.organisationId === selectorOrganisation.id ? active.module : "dashboard";
    navigate(authenticatedPortalPath({ organisationId: selectorOrganisation.id, siteId, module }));
    selectorPinnedRef.current = false;
    setSelectorPinned(false);
    setOpenScopeOrganisationId(null);
    if (isMobile) setMobileDrawer("secondary");
  };

  const navigateModule = (module: PortalModule) => {
    if (!active) return;
    navigate(authenticatedPortalPath({ ...active, module }));
    if (isMobile) setMobileDrawer("closed");
  };

  const handleOrganisationKey = (event: KeyboardEvent<HTMLButtonElement>, organisationId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openScopeSelector(organisationId, true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeScopeSelector(true);
    } else if (event.key === "Tab" && !event.shiftKey && openScopeOrganisationId === organisationId) {
      event.preventDefault();
      secondaryPanelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    }
  };

  const handleLogout = async () => {
    await logout();
    onLogout?.();
    navigate("/login", { replace: true });
  };

  const closeNavigationAndGo = (path: string) => {
    closeScopeSelector();
    navigate(path);
  };

  const primaryRow = (label: string, icon: ReactNode, path: string, activeRow: boolean) => isMobile ? (
    <MobileSidebarRow label={label} icon={icon} active={activeRow} onTap={() => closeNavigationAndGo(path)} />
  ) : <NavRow label={label} leftIcon={icon} to={path} active={activeRow} onClick={() => closeScopeSelector()} />;

  const scopeRows = selectorOrganisation && (
    <NavList className="vrm-secondary-list" aria-label={`${selectorOrganisation.name} scopes`}>
      <NavRow
        label="All Sites"
        leftIcon={<NavIcon icon={MapPin} />}
        active={active?.organisationId === selectorOrganisation.id && !active.siteId}
        onClick={() => selectScope()}
      />
      {selectorOrganisation.sites.map((site) => (
        <NavRow
          key={site.id}
          label={site.name}
          leftIcon={<NavIcon icon={MapPin} />}
          active={active?.organisationId === selectorOrganisation.id && active.siteId === site.id}
          onClick={() => selectScope(site.id)}
        />
      ))}
    </NavList>
  );

  const activeScopeLabel = active?.siteId
    ? activeOrganisation?.sites.find((site) => site.id === active.siteId)?.name
    : "All Sites";
  const moduleRows = active && activeOrganisation && (
    <>
      <div className="vrm-secondary-header">
        {isMobile && mobileDrawer === "secondary" && <button className="vrm-sidebar-mobile-close-button" aria-label="Close organisation navigation" onClick={() => setMobileDrawer("closed")}>✕</button>}
        {isMobile ? (
          <MobileSidebarRow
            icon={<span className="vrm-nav-row__icon-stack"><NavIcon icon={ArrowLeft} /><NavIcon icon={MapPin} /></span>}
            label={activeScopeLabel ?? "Scope unavailable"}
            onTap={() => openScopeSelector(active.organisationId, true)}
          />
        ) : (
          <SecondaryPinnedRow
            leftIcon={<span className="vrm-nav-row__icon-stack"><NavIcon icon={ArrowLeft} /><NavIcon icon={MapPin} /></span>}
            label={activeScopeLabel ?? "Scope unavailable"}
            onClick={() => openScopeSelector(active.organisationId, true)}
          />
        )}
        <SecondaryDivider />
      </div>
      <NavList className="vrm-secondary-list" aria-label={`${activeOrganisation.name} modules`}>
        {PORTAL_MODULES.map((module) => (
          <NavRow
            key={module}
            label={moduleDetails[module].label}
            leftIcon={moduleDetails[module].icon}
            active={active.module === module}
            onClick={() => navigateModule(module)}
          />
        ))}
      </NavList>
    </>
  );

  return (
    <div
      className={`vrm-layout ${isMobile ? "vrm-layout--mobile" : ""} ${!showSecondary ? "vrm-layout--no-secondary" : ""} ${mobileDrawer === "primary" ? "vrm-layout--mobile-primary-open" : ""} ${mobileDrawer === "secondary" ? "vrm-layout--mobile-site-open" : ""}`}
      data-testid="authenticated-app-shell"
    >
      <div className={`vrm-sidebar-shell vrm-sidebar-shell--sites vrm-sidebar-shell--expanded ${showSecondary ? "vrm-sidebar-shell--secondary-expanded" : "vrm-sidebar-shell--no-secondary"}`}>
        <nav id="vrm-primary-rail" className="vrm-primary-rail" aria-label="Primary">
          <div className="vrm-sidebar-header vrm-sidebar-header--brand">
            {isMobile && mobileDrawer === "closed" && <button className="vrm-sidebar-mobile-open-button" aria-label="Open primary navigation" onClick={() => setMobileDrawer("primary")}><NavIcon icon={ChevronRight} /></button>}
            {isMobile && mobileDrawer === "primary" && <button className="vrm-sidebar-mobile-close-button" aria-label="Close primary sidebar" onClick={() => setMobileDrawer("closed")}>✕</button>}
            <div className="vrm-brand-header">
              <div className="vrm-logo"><img src={camOSLogo} alt="camOS" className="vrm-logo-img" /></div>
              <div className="vrm-brand-text"><div className="vrm-brand-title">camOS</div></div>
            </div>
          </div>
          <NavList className="vrm-primary-nav">
            {primaryRow("Home", <NavIcon icon={Home} />, "/home", location.pathname === "/home")}
            {organisations.map((organisation) => {
              const routeActive = active?.organisationId === organisation.id;
              const selectorOpen = openScopeOrganisationId === organisation.id;
              const button = isMobile ? (
                <MobileSidebarRow
                  label={organisation.name}
                  icon={<NavIcon icon={MapPin} />}
                  rightSlot={<NavIcon icon={ChevronRight} />}
                  active={routeActive}
                  onTap={() => openScopeSelector(organisation.id, true)}
                />
              ) : (
                <button
                  ref={(node) => { if (node) organisationButtonRefs.current.set(organisation.id, node); }}
                  type="button"
                  className={`vrm-nav-row vrm-nav-row--interactive ${routeActive ? "vrm-nav-row--active" : ""}`}
                  aria-expanded={selectorOpen}
                  aria-controls="vrm-secondary-panel"
                  onPointerEnter={() => { if (!isMobile) openScopeSelector(organisation.id, false); }}
                  onPointerLeave={scheduleClose}
                  onClick={() => openScopeSelector(organisation.id, true)}
                  onKeyDown={(event) => handleOrganisationKey(event, organisation.id)}
                >
                  <span className="vrm-nav-row__icon"><NavIcon icon={MapPin} /></span>
                  <span className="vrm-nav-row__label">{organisation.name}</span>
                  <span className="vrm-nav-row__right"><NavIcon icon={ChevronRight} /></span>
                </button>
              );
              return <div className="vrm-sites-row-wrapper" key={organisation.id}>{button}</div>;
            })}
            {primaryRow("Documents", <NavIcon icon={FileText} />, "/documents", location.pathname.startsWith("/documents"))}
            {primaryRow("Settings", <NavIcon icon={Settings} />, "/settings/account", isSettings)}
            {isMobile ? (
              <MobileSidebarRow label="Logout" icon={<NavIcon icon={LogOut} />} onTap={handleLogout} />
            ) : (
              <NavRow label="Logout" leftIcon={<NavIcon icon={LogOut} />} onClick={handleLogout} />
            )}
          </NavList>
        </nav>

        {showSecondary && (
          <nav
            ref={secondaryPanelRef}
            id="vrm-secondary-panel"
            className="vrm-extended-panel"
            aria-label={secondaryMode === "scope-selector" ? `${selectorOrganisation!.name} scope selector` : secondaryMode === "modules" ? `${activeOrganisation!.name} module navigation` : "Settings"}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
            onKeyDown={(event) => { if (event.key === "Escape" && secondaryMode === "scope-selector") closeScopeSelector(true); }}
          >
            {secondaryMode === "settings" && <SettingsSecondaryNav />}
            {secondaryMode === "scope-selector" && (
              <>
                <div className="vrm-secondary-header">
                  {isMobile && mobileDrawer === "secondary" && <button className="vrm-sidebar-mobile-close-button" aria-label="Close organisation navigation" onClick={() => closeScopeSelector(true)}>✕</button>}
                  <strong className="vrm-organisation-navigation-title">{selectorOrganisation!.name}</strong>
                </div>
                {scopeRows}
              </>
            )}
            {secondaryMode === "modules" && moduleRows}
          </nav>
        )}
      </div>
      {isMobile && mobileDrawer !== "closed" && <button type="button" className="vrm-sidebar-mobile-backdrop" aria-label="Close sidebar" onClick={() => closeScopeSelector()} />}
      <main className={`vrm-main ${isMobile ? "vrm-main--mobile-lane" : ""}`}>
        <div className={`vrm-content ${isMobile ? "vrm-content--mobile-lane" : ""}`}>
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
