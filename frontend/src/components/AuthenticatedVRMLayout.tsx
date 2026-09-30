import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, ChevronRight, ClipboardList, Cpu, FileBarChart2, FileText,
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
import { NavList, NavRow, SecondaryDivider } from "../common/components/navigation";
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
  const [previewOrganisationId, setPreviewOrganisationId] = useState<string | null>(null);
  const [pinnedOrganisationId, setPinnedOrganisationId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<"closed" | "primary" | "secondary">("closed");
  const closeTimer = useRef<number | null>(null);
  const secondaryPanelRef = useRef<HTMLElement | null>(null);
  const organisationButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previewId = previewOrganisationId ?? pinnedOrganisationId ?? active?.organisationId ?? null;
  const previewOrganisation = organisations.find((organisation) => organisation.id === previewId);
  const isSettings = location.pathname.startsWith("/settings");
  const showSecondary = Boolean(previewOrganisation) || isSettings;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px), ((max-width: 1024px) and (hover: none) and (pointer: coarse))");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (active && !organisations.some((organisation) => organisation.id === active.organisationId)) {
      navigate("/home", { replace: true });
    }
  }, [active, organisations, navigate]);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setPreviewOrganisationId(null), 180);
  };
  useEffect(() => () => cancelClose(), []);

  const openOrganisation = (id: string, pin = false) => {
    cancelClose();
    setPreviewOrganisationId(id);
    if (pin) setPinnedOrganisationId(id);
    if (isMobile) setMobileDrawer("secondary");
  };

  const closePreview = (restoreFocus = false) => {
    const id = previewOrganisationId ?? pinnedOrganisationId;
    setPreviewOrganisationId(null);
    setPinnedOrganisationId(null);
    if (isMobile) setMobileDrawer("closed");
    if (restoreFocus && id) organisationButtonRefs.current.get(id)?.focus();
  };

  const candidateModule = active?.module ?? "dashboard";
  const candidateSiteId = active?.organisationId === previewId ? active.siteId : undefined;
  const navigatePortal = (siteId: string | undefined, module: PortalModule, closeAfter = true) => {
    if (!previewOrganisation) return;
    navigate(authenticatedPortalPath({ organisationId: previewOrganisation.id, siteId, module }));
    if (closeAfter) {
      setPinnedOrganisationId(null);
      setPreviewOrganisationId(null);
      setMobileDrawer("closed");
    } else {
      setPinnedOrganisationId(previewOrganisation.id);
      setPreviewOrganisationId(previewOrganisation.id);
    }
  };

  const handleOrganisationKey = (event: KeyboardEvent<HTMLButtonElement>, organisationId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openOrganisation(organisationId, true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePreview(true);
    } else if (event.key === "Tab" && !event.shiftKey && previewId === organisationId) {
      event.preventDefault();
      secondaryPanelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    }
  };

  const handleLogout = async () => {
    await logout();
    onLogout?.();
    navigate("/login", { replace: true });
  };

  const primaryRow = (
    label: string,
    icon: ReactNode,
    path: string,
    activeRow: boolean,
  ) => isMobile ? (
    <MobileSidebarRow label={label} icon={icon} active={activeRow} onTap={() => {
      navigate(path); setMobileDrawer("closed"); closePreview();
    }} />
  ) : <NavRow label={label} leftIcon={icon} to={path} active={activeRow} />;

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
              const selected = active?.organisationId === organisation.id;
              const button = isMobile ? (
                <MobileSidebarRow
                  label={organisation.name}
                  icon={<NavIcon icon={MapPin} />}
                  rightSlot={<NavIcon icon={ChevronRight} />}
                  active={selected}
                  onTap={() => openOrganisation(organisation.id, true)}
                />
              ) : (
                <button
                  ref={(node) => { if (node) organisationButtonRefs.current.set(organisation.id, node); }}
                  type="button"
                  className={`vrm-nav-row vrm-nav-row--interactive ${selected ? "vrm-nav-row--active" : ""}`}
                  aria-expanded={previewId === organisation.id}
                  aria-controls="vrm-secondary-panel"
                  onPointerEnter={() => openOrganisation(organisation.id)}
                  onPointerLeave={scheduleClose}
                  onFocus={() => openOrganisation(organisation.id)}
                  onClick={() => openOrganisation(organisation.id, true)}
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
            aria-label={previewOrganisation ? `${previewOrganisation.name} navigation` : "Settings"}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
            onKeyDown={(event) => { if (event.key === "Escape") closePreview(true); }}
          >
            {isSettings && !previewOrganisation ? <SettingsSecondaryNav /> : previewOrganisation && (
              <>
                <div className="vrm-secondary-header">
                  {isMobile && <button className="vrm-sidebar-mobile-close-button" aria-label="Close organisation navigation" onClick={() => closePreview(true)}>✕</button>}
                  <strong className="vrm-organisation-navigation-title">{previewOrganisation.name}</strong>
                  <span className="vrm-organisation-navigation-section">Scope</span>
                </div>
                <NavList className="vrm-secondary-list">
                  <NavRow
                    label="Full organisation"
                    leftIcon={<NavIcon icon={MapPin} />}
                    active={active?.organisationId === previewOrganisation.id && !active.siteId}
                    onClick={() => navigatePortal(undefined, candidateModule, !isMobile)}
                  />
                  {previewOrganisation.sites.map((site) => (
                    <NavRow
                      key={site.id}
                      label={site.name}
                      leftIcon={<NavIcon icon={MapPin} />}
                      active={active?.organisationId === previewOrganisation.id && active.siteId === site.id}
                      onClick={() => navigatePortal(site.id, candidateModule, !isMobile)}
                    />
                  ))}
                  <SecondaryDivider />
                  <span className="vrm-organisation-navigation-section">Modules</span>
                  {PORTAL_MODULES.map((module) => (
                    <NavRow
                      key={module}
                      label={moduleDetails[module].label}
                      leftIcon={moduleDetails[module].icon}
                      active={active?.organisationId === previewOrganisation.id && active.module === module}
                      onClick={() => navigatePortal(candidateSiteId, module)}
                    />
                  ))}
                </NavList>
              </>
            )}
          </nav>
        )}
      </div>
      {isMobile && mobileDrawer !== "closed" && <button type="button" className="vrm-sidebar-mobile-backdrop" aria-label="Close sidebar" onClick={() => closePreview()} />}
      <main className={`vrm-main ${isMobile ? "vrm-main--mobile-lane" : ""}`}>
        <div className={`vrm-content ${isMobile ? "vrm-content--mobile-lane" : ""}`}>
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
