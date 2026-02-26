import React, { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { logout } from "../features/auth/transport/me";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  FileBarChart2,
  FileText,
  Home,
  LayoutDashboard,
  MapPin,
  Plus,
  Settings,
  Shield,
  TrendingUp,
  LogOut,
} from "lucide-react";
import "../styles/VRMTheme.css";
import "../styles/VRMNavigation.css";
import camOSLogo from "../assets/brand/camOS-logo.png";
import {
  SITE_OPTIONS,
  findSiteById,
  getStoredSiteId,
  setStoredSiteId,
} from "../lib/sites";
import { isDemoSessionActive } from "../lib/demoSession";
import {
  NavList,
  NavRow,
  SecondaryDivider,
  SecondaryPinnedRow,
  SecondarySearch,
} from "../common/components/navigation";
import { NavIcon } from "../common/components/icons";

interface VRMLayoutProps {
  userRole?: "client" | "admin";
  isAuthenticated?: boolean;
  onLogout?: () => void;
  children?: React.ReactNode;
}
const VRMLayout: React.FC<VRMLayoutProps> = ({
  userRole = "client",
  isAuthenticated = false,
  onLogout,
  children,
}) => {
  // Sidebar state and refs
  const [isPrimaryFocused, setIsPrimaryFocused] = useState(false);
  const [isSecondaryFocused, setIsSecondaryFocused] = useState(false);
  const sitesHoverTimeout = useRef<number | null>(null);
  const secondaryFocusRef = useRef(false);
  const primaryRailRef = useRef<HTMLDivElement | null>(null);
  const secondaryPanelRef = useRef<HTMLDivElement | null>(null);
  const sidebarShellRef = useRef<HTMLDivElement | null>(null);
  const sitesRowRef = useRef<HTMLDivElement | null>(null);
  const pointerInsideSidebarRef = useRef(false);
  const [pointerZone, setPointerZone] = useState<
    "OUTSIDE" | "PRIMARY" | "SITES_ROW" | "SECONDARY"
  >("OUTSIDE");
  const pointerZoneRef = useRef(pointerZone);
  const [isTouchMode, setIsTouchMode] = useState(false);
  const [sitesIntentOpen, setSitesIntentOpen] = useState(false);
  const [forcedSitesExpandOnceActive, setForcedSitesExpandOnceActive] = useState(false);
  const [keepMenuExpanded, setKeepMenuExpanded] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const stored = window.localStorage.getItem("vrm_keep_menu_expanded");
    if (stored === null) {
      return false;
    }
    return stored === "true";
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { siteId } = useParams();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const isEmbedMode = searchParams.get("embed") === "1";
  const isSelectorOpen = searchParams.get("panel") === "sites";
  const isForceExpandIntent = searchParams.get("expand_once") === "1";
  const activeSite = findSiteById(siteId);
  const isDemoSession = isDemoSessionActive();
  const allSitesOption =
    SITE_OPTIONS.find((site) => site.id === "all") ?? SITE_OPTIONS[0];
  const selectorSiteOptions = isAuthenticated
    ? []
    : SITE_OPTIONS.filter((site) => site.id !== "all");
  const buildSearch = (overrides?: Record<string, string | undefined>) => {
    const params = new URLSearchParams(location.search);
    if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, "panel")) {
      params.delete("panel");
    }
    if (overrides) {
      Object.entries(overrides).forEach(([key, value]) => {
        if (value === undefined) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  };
  const getNavigationPath = (
    path: string,
    overrides?: Record<string, string | undefined>,
  ) => `${path}${buildSearch(overrides)}`;
  const openSitesSelector = () => {
    navigate(
      {
        pathname: location.pathname,
        search: buildSearch({ panel: "sites" }),
      },
      { replace: isDemoSession },
    );
  };
  const handleSitesClick = () => {
    setSitesIntentOpen(true);
    openSitesSelector();
  };
  useEffect(() => {
    if (siteId) {
      setStoredSiteId(siteId);
    }
  }, [siteId]);
  useEffect(() => {
    pointerZoneRef.current = pointerZone;
  }, [pointerZone]);
  useEffect(() => {
    secondaryFocusRef.current = isSecondaryFocused;
  }, [isSecondaryFocused]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia(
      "(hover: none), (pointer: coarse)",
    );
    const syncTouchMode = () => {
      const isTouch = mediaQuery.matches;
      setIsTouchMode(isTouch);
      if (isTouch) {
        setKeepMenuExpanded(true);
      }
    };
    syncTouchMode();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", syncTouchMode);
      return () => mediaQuery.removeEventListener("change", syncTouchMode);
    }
    mediaQuery.addListener(syncTouchMode);
    return () => mediaQuery.removeListener(syncTouchMode);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      "vrm_keep_menu_expanded",
      String(keepMenuExpanded),
    );
  }, [keepMenuExpanded]);
  // Navigation config
  const primaryNavigationItems = useMemo(
    () => [
      {
        path: "/home",
        label: "Home",
        icon: <NavIcon icon={Home} />,
      },
      {
        path: "/sites",
        label: "Sites",
        icon: <NavIcon icon={MapPin} />,
      },
    ],
    [],
  );
  const clientNavigationItems = useMemo(
    () => [
      {
        path: siteId ? `/sites/${siteId}/dashboard` : undefined,
        label: "Dashboard",
        icon: <NavIcon icon={LayoutDashboard} />,
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: <NavIcon icon={BarChart3} />,
        disabled: true,
        statusLabel: "Coming Soon",
      },
      {
        id: "forecasts",
        label: "Forecasts",
        icon: <NavIcon icon={TrendingUp} />,
        disabled: true,
        statusLabel: "Coming Soon",
      },
      {
        path: siteId ? `/sites/${siteId}/event-logs` : undefined,
        label: "Event Logs",
        icon: <NavIcon icon={ClipboardList} />,
      },
      {
        path: siteId ? `/sites/${siteId}/alarm-logs` : undefined,
        label: "Alarm Logs",
        icon: <NavIcon icon={Bell} />,
      },
      {
        path: siteId ? `/sites/${siteId}/device-list` : undefined,
        label: "Device List",
        icon: <NavIcon icon={Cpu} />,
      },
      {
        path: siteId ? `/sites/${siteId}/reports` : undefined,
        label: "Reports",
        icon: <NavIcon icon={FileBarChart2} />,
      },
    ],
    [siteId],
  );
  const adminNavigationItems = useMemo(
    () => [
      {
        path: "/admin",
        label: "Admin",
        icon: <NavIcon icon={Shield} />,
      },
    ],
    [],
  );
  // Derived state
  const isActiveRoute = (path: string) => {
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };
  const primaryActivePath = primaryNavigationItems.find(
    (item) => item.path && isActiveRoute(item.path),
  )?.path;
  const isSiteSelection = isSelectorOpen;
  const selectedSiteForList = getStoredSiteId() ?? "all";
  const showSiteMenu = Boolean(siteId) && !isSelectorOpen;
  const isHomeRoute = location.pathname === "/home";
  const isSitesRoute = /^\/sites(?:\/|$)/.test(location.pathname);
  const shouldRenderSecondaryPanel = !isHomeRoute || isSelectorOpen;
  const shouldShowAdminMenu =
    userRole === "admin" && location.pathname.startsWith("/admin");
  const showLogout = isAuthenticated;
  const handleLogoutClick = async () => {
    await logout();
    onLogout?.();
    navigate("/login", { replace: true });
  };
  const focusZone = isSecondaryFocused
    ? "SECONDARY"
    : isPrimaryFocused
      ? "PRIMARY"
      : "OUTSIDE";
  const shouldForceCollapse =
    !keepMenuExpanded &&
    pointerZone === "OUTSIDE" &&
    focusZone === "OUTSIDE" &&
    !sitesIntentOpen;
  const isPrimaryExpanded =
    keepMenuExpanded ||
    pointerZone === "PRIMARY" ||
    pointerZone === "SITES_ROW" ||
    focusZone === "PRIMARY" ||
    sitesIntentOpen;
  const isSecondaryExpanded = forcedSitesExpandOnceActive
    ? true
    : !shouldForceCollapse &&
      (keepMenuExpanded ||
        pointerZone === "SITES_ROW" ||
        pointerZone === "SECONDARY" ||
        focusZone === "SECONDARY" ||
        sitesIntentOpen);
  const toggleLabel = keepMenuExpanded ? "Collapse Sidebar" : "Keep Expanded";
  const toggleIcon = keepMenuExpanded ? (
    <NavIcon icon={ChevronLeft} className="vrm-nav-chevron" />
  ) : (
    <NavIcon icon={ChevronRight} className="vrm-nav-chevron" />
  );
  // Interaction handlers
  const handleKeepExpandedToggle = () => {
    if (isTouchMode) {
      return;
    }
    setKeepMenuExpanded((prev) => !prev);
  };
  const handleFocusChange =
    (setter: React.Dispatch<React.SetStateAction<boolean>>) =>
    (event: React.FocusEvent<HTMLElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (event.currentTarget.contains(nextTarget)) {
        return;
      }
      setter(false);
    };

  // Effects
  useEffect(() => {
    if (keepMenuExpanded || typeof window === "undefined") {
      return;
    }
    const secondaryPanel = document.querySelector(".vrm-extended-panel");
    const isFocused = secondaryPanel?.matches(":focus-within") ?? false;
    setIsSecondaryFocused(isFocused);
  }, [keepMenuExpanded, location.pathname, siteId]);
  useEffect(() => {
    if (!isSelectorOpen || typeof window === "undefined") {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      const isInsideSecondary =
        Boolean(secondaryPanelRef.current) &&
        secondaryPanelRef.current.contains(target);
      const isInsideSitesToggle =
        Boolean(sitesRowRef.current) && sitesRowRef.current.contains(target);
      if (isInsideSecondary || isInsideSitesToggle) {
        return;
      }

      if (forcedSitesExpandOnceActive) {
        setForcedSitesExpandOnceActive(false);
        return;
      }

      navigate(
        {
          pathname: location.pathname,
          search: buildSearch({ panel: undefined }),
        },
        { replace: true },
      );
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, [
    buildSearch,
    forcedSitesExpandOnceActive,
    isSelectorOpen,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (!isSitesRoute || !isSelectorOpen) {
      setForcedSitesExpandOnceActive(false);
      return;
    }

    if (!isForceExpandIntent) {
      return;
    }

    setForcedSitesExpandOnceActive(true);

    navigate(
      {
        pathname: location.pathname,
        search: buildSearch({ panel: "sites", expand_once: undefined }),
      },
      { replace: true },
    );
  }, [
    buildSearch,
    isForceExpandIntent,
    isSelectorOpen,
    isSitesRoute,
    location.pathname,
    navigate,
  ]);
  useEffect(() => {
    if (keepMenuExpanded || isTouchMode || typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const primaryRect = primaryRailRef.current?.getBoundingClientRect();
      const insidePrimary =
        Boolean(primaryRect) &&
        event.clientX >= primaryRect.left &&
        event.clientX <= primaryRect.right &&
        event.clientY >= primaryRect.top &&
        event.clientY <= primaryRect.bottom;

      const shellRect = sidebarShellRef.current?.getBoundingClientRect();
      if (!shellRect) {
        return;
      }
      const insideSidebar =
        event.clientX >= shellRect.left &&
        event.clientX <= shellRect.right &&
        event.clientY >= shellRect.top &&
        event.clientY <= shellRect.bottom;
      if (pointerInsideSidebarRef.current !== insideSidebar) {
        pointerInsideSidebarRef.current = insideSidebar;
      }

      const secondaryRect = secondaryPanelRef.current?.getBoundingClientRect();
      const insideSecondary =
        Boolean(secondaryRect) &&
        event.clientX >= secondaryRect.left &&
        event.clientX <= secondaryRect.right &&
        event.clientY >= secondaryRect.top &&
        event.clientY <= secondaryRect.bottom;

      const siteRect = sitesRowRef.current?.getBoundingClientRect();
      const insideSitesRow =
        Boolean(siteRect) &&
        event.clientX >= siteRect.left &&
        event.clientX <= siteRect.right &&
        event.clientY >= siteRect.top &&
        event.clientY <= siteRect.bottom;

      const rawZone = insideSecondary
        ? "SECONDARY"
        : insideSitesRow
          ? "SITES_ROW"
          : insidePrimary
            ? "PRIMARY"
            : "OUTSIDE";
      const zoneForState =
        rawZone === "OUTSIDE" && pointerZoneRef.current === "SITES_ROW"
          ? "SITES_ROW"
          : rawZone;
      if (
        rawZone === "SITES_ROW" ||
        rawZone === "SECONDARY" ||
        rawZone === "PRIMARY"
      ) {
        cancelSitesLeaveTimer();
      }
      if (rawZone === "OUTSIDE" && pointerZoneRef.current === "SITES_ROW") {
        if (sitesHoverTimeout.current === null) {
          sitesHoverTimeout.current = window.setTimeout(() => {
            sitesHoverTimeout.current = null;
            if (pointerZoneRef.current === "SITES_ROW") {
              setPointerZone("OUTSIDE");
            }
          }, 180);
        }
      } else {
        if (sitesHoverTimeout.current !== null) {
          window.clearTimeout(sitesHoverTimeout.current);
          sitesHoverTimeout.current = null;
        }
        if (pointerZoneRef.current !== rawZone) {
          setPointerZone(rawZone);
        }
      }

      if (!insideSidebar) {
        cancelSitesLeaveTimer();
        if (
          secondaryPanelRef.current &&
          document.activeElement instanceof HTMLElement &&
          secondaryPanelRef.current.contains(document.activeElement)
        ) {
          document.activeElement.blur();
          setIsSecondaryFocused(false);
        }
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const shellRect = sidebarShellRef.current?.getBoundingClientRect();
      const outsideShell =
        Boolean(shellRect) &&
        (event.clientX < shellRect.left ||
          event.clientX > shellRect.right ||
          event.clientY < shellRect.top ||
          event.clientY > shellRect.bottom);
      if (
        !keepMenuExpanded &&
        (outsideShell || !pointerInsideSidebarRef.current) &&
        secondaryPanelRef.current &&
        document.activeElement instanceof HTMLElement &&
        secondaryPanelRef.current.contains(document.activeElement)
      ) {
        document.activeElement.blur();
        setIsSecondaryFocused(false);
      }
      if (!keepMenuExpanded && outsideShell) {
        cancelSitesLeaveTimer();
        setSitesIntentOpen(false);
        setForcedSitesExpandOnceActive(false);
        setPointerZone("OUTSIDE");
        setIsSecondaryFocused(false);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isTouchMode, keepMenuExpanded]);
  useEffect(() => {
    if (
      keepMenuExpanded ||
      pointerInsideSidebarRef.current ||
      pointerZoneRef.current === "SECONDARY" ||
      secondaryFocusRef.current
    ) {
      return;
    }
    setIsSecondaryFocused(false);
    if (sitesHoverTimeout.current !== null) {
      window.clearTimeout(sitesHoverTimeout.current);
      sitesHoverTimeout.current = null;
    }
    if (pointerZoneRef.current !== "OUTSIDE") {
      setPointerZone("OUTSIDE");
    }
    if (
      secondaryPanelRef.current &&
      document.activeElement instanceof HTMLElement &&
      secondaryPanelRef.current.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }, [keepMenuExpanded, location.pathname, siteId, isSelectorOpen]);

  useEffect(() => {
    if (
      keepMenuExpanded ||
      pointerZone !== "OUTSIDE" ||
      focusZone !== "OUTSIDE"
    ) {
      return;
    }
    cancelSitesLeaveTimer();
    setSitesIntentOpen(false);
    setIsSecondaryFocused(false);
    setIsPrimaryFocused(false);
    if (
      secondaryPanelRef.current &&
      document.activeElement instanceof HTMLElement &&
      secondaryPanelRef.current.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }, [
    focusZone,
    isSelectorOpen,
    keepMenuExpanded,
    location.pathname,
    location.search,
    pointerZone,
    siteId,
  ]);

  useEffect(() => {
    return () => {
      if (sitesHoverTimeout.current !== null) {
        window.clearTimeout(sitesHoverTimeout.current);
      }
    };
  }, []);
  const cancelSitesLeaveTimer = () => {
    if (sitesHoverTimeout.current !== null) {
      window.clearTimeout(sitesHoverTimeout.current);
      sitesHoverTimeout.current = null;
    }
  };
  const handleSitesRowEnter = () => {
    cancelSitesLeaveTimer();
    setPointerZone("SITES_ROW");
  };
  const handleSitesRowLeave = () => {
    // Grace period prevents accidental collapse while moving between rails.
    cancelSitesLeaveTimer();
    sitesHoverTimeout.current = window.setTimeout(() => {
      if (
        pointerInsideSidebarRef.current ||
        pointerZoneRef.current === "SECONDARY" ||
        secondaryFocusRef.current
      ) {
        return;
      }
      if (pointerZoneRef.current === "SITES_ROW") {
        setPointerZone("OUTSIDE");
      }
    }, 180);
  };

  if (isEmbedMode) {
    return (
      <div className="vrm-layout vrm-layout--embed">
        <main className="vrm-main vrm-main--embed">
          <div className="vrm-content vrm-content--embed">{children || <Outlet />}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="vrm-layout">
      <div
        ref={sidebarShellRef}
        className={`vrm-sidebar-shell vrm-sidebar-shell--sites ${
          keepMenuExpanded ? "vrm-sidebar-shell--expanded" : ""
        } ${
          !keepMenuExpanded && !isPrimaryExpanded
            ? "vrm-sidebar-shell--primary-collapsed"
            : ""
        } ${
          !keepMenuExpanded && isPrimaryExpanded
            ? "vrm-sidebar-shell--primary-expanded"
            : ""
        } ${
          !keepMenuExpanded && !isSecondaryExpanded
            ? "vrm-sidebar-shell--secondary-collapsed"
            : ""
        } ${
          !keepMenuExpanded && isSecondaryExpanded
            ? "vrm-sidebar-shell--secondary-expanded"
            : ""
        }`}
        aria-label="Primary"
      >
        <nav
          className="vrm-primary-rail"
          aria-label="Primary"
          ref={primaryRailRef}
          onFocusCapture={() => setIsPrimaryFocused(true)}
          onBlurCapture={handleFocusChange(setIsPrimaryFocused)}
        >
          <div className="vrm-sidebar-header vrm-sidebar-header--brand">
            <div className="vrm-brand-header">
              <div className="vrm-logo">
                <img src={camOSLogo} alt="camOS" className="vrm-logo-img" />
              </div>
              <div className="vrm-brand-text">
                <div className="vrm-brand-title">camOS</div>
                <div className="vrm-brand-subrow">
                  <span className="vrm-brand-badge" aria-label="Demo">
                    DEMO
                  </span>
                </div>
              </div>
            </div>
          </div>
          <NavList className="vrm-primary-nav">
            {primaryNavigationItems.map((item) => {
              const isActive = primaryActivePath === item.path;
              const navRow = (
                <NavRow
                  key={item.path ?? item.label}
                  to={
                    item.path && item.path !== "/sites"
                      ? getNavigationPath(item.path)
                      : undefined
                  }
                  replace={Boolean(item.path) && isDemoSession}
                  onClick={item.path === "/sites" ? handleSitesClick : undefined}
                  leftIcon={item.icon}
                  label={item.label}
                  active={isActive}
                  ariaLabel={!isPrimaryExpanded ? item.label : undefined}
                  rightSlot={
                    item.path === "/sites" ? (
                      <NavIcon icon={ChevronRight} className="vrm-nav-chevron" />
                    ) : undefined
                  }
                />
              );
              if (item.path !== "/sites") {
                return navRow;
              }
              return (
                <div
                  key="sites-row-wrapper"
                  ref={sitesRowRef}
                  className="vrm-sites-row-wrapper"
                  onPointerEnter={handleSitesRowEnter}
                  onPointerLeave={handleSitesRowLeave}
                >
                  {navRow}
                </div>
              );
            })}
            <NavRow
              leftIcon={<NavIcon icon={FileText} />}
              label="Documents"
              className="vrm-nav-row--placeholder"
              ariaLabel={!isPrimaryExpanded ? "Documents" : undefined}
            />
            <NavRow
              leftIcon={toggleIcon}
              label={toggleLabel}
              onClick={handleKeepExpandedToggle}
              active={keepMenuExpanded}
              className="vrm-nav-row--toggle"
              ariaLabel={!isPrimaryExpanded ? toggleLabel : undefined}
            />
            <NavRow
              leftIcon={<NavIcon icon={Settings} />}
              label="Settings"
              className="vrm-nav-row--placeholder"
              ariaLabel={!isPrimaryExpanded ? "Settings" : undefined}
            />
            {showLogout && (
              <NavRow
                onClick={handleLogoutClick}
                leftIcon={<NavIcon icon={LogOut} />}
                label="Logout"
                className="vrm-nav-row--interactive"
                ariaLabel={!isPrimaryExpanded ? "Logout" : undefined}
              />
            )}
          </NavList>
        </nav>
        {shouldRenderSecondaryPanel && (
          <nav
          className="vrm-extended-panel"
          aria-label="Secondary"
          ref={secondaryPanelRef}
          onFocusCapture={() => setIsSecondaryFocused(true)}
          onBlurCapture={handleFocusChange(setIsSecondaryFocused)}
          onPointerEnter={cancelSitesLeaveTimer}
          onPointerLeave={handleSitesRowLeave}
        >
          <div className="vrm-secondary-header">
            <SecondarySearch />
            {!showSiteMenu && (
              <SecondaryPinnedRow
                to={getNavigationPath(
                  `/sites/${allSitesOption.id}/dashboard`,
                  { panel: undefined },
                )}
                replace={isDemoSession}
                leftIcon={<NavIcon icon={MapPin} />}
                label={allSitesOption.label}
                active={
                  isSiteSelection && allSitesOption.id === selectedSiteForList
                }
              />
            )}
            {showSiteMenu && (
              <SecondaryPinnedRow
                onClick={openSitesSelector}
                leftIcon={
                  <span className="vrm-nav-row__icon-stack">
                    <NavIcon icon={ArrowLeft} className="vrm-nav-back" size={18} />
                    <NavIcon icon={MapPin} />
                  </span>
                }
                label={activeSite?.label ?? "Site"}
              />
            )}
            <SecondaryDivider />
          </div>
          {!showSiteMenu && (
            <NavList className="vrm-secondary-list">
              {selectorSiteOptions.map((site) => {
                const siteSubPath = (() => {
                  const match = location.pathname.match(/^\/sites\/[^/]+(\/.*)?$/);
                  const trailing = match?.[1];
                  if (!trailing || trailing === "/") {
                    return "/dashboard";
                  }
                  return trailing;
                })();
                const siteTargetPath = `/sites/${site.id}${siteSubPath}`;
                const isActive =
                  isSiteSelection && site.id === selectedSiteForList;
                return (
                  <NavRow
                    key={site.id}
                    to={getNavigationPath(siteTargetPath, { panel: undefined })}
                    replace={isDemoSession}
                    leftIcon={<NavIcon icon={MapPin} />}
                    label={site.label}
                    active={isActive}
                    ariaLabel={!isSecondaryExpanded ? site.label : undefined}
                  />
                );
              })}
              <NavRow
                leftIcon={<NavIcon icon={Plus} />}
                label="Add site"
                className="vrm-nav-row--inert"
                ariaLabel={!isSecondaryExpanded ? "Add site" : undefined}
              />
            </NavList>
          )}
          {showSiteMenu && !shouldShowAdminMenu && (
            <NavList className="vrm-secondary-list">
              {clientNavigationItems.map((item) => {
                const isDisabled = Boolean(item.disabled);
                const isActive =
                  item.path && !isDisabled ? isActiveRoute(item.path) : false;
                const navLabel = (
                  <span className="vrm-nav-row__label-text">
                    {item.label}
                    {item.statusLabel && (
                      <span className="vrm-nav-row__chip">
                        {item.statusLabel}
                      </span>
                    )}
                  </span>
                );
                if (isDisabled) {
                  return (
                    <NavRow
                      key={item.id ?? item.label}
                      leftIcon={item.icon}
                      label={navLabel}
                      disabled
                      ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                    />
                  );
                }
                if (!item.path) {
                  return null;
                }
                return (
                  <NavRow
                    key={item.path}
                    to={getNavigationPath(item.path)}
                    replace={isDemoSession}
                    leftIcon={item.icon}
                    label={navLabel}
                    active={isActive}
                    ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                  />
                );
              })}
            </NavList>
          )}
          {shouldShowAdminMenu && (
            <NavList className="vrm-secondary-list">
              {adminNavigationItems.map((item) => (
                <NavRow
                  key={item.path}
                  to={getNavigationPath(item.path)}
                  replace={isDemoSession}
                  leftIcon={item.icon}
                  label={item.label}
                  active={item.path ? isActiveRoute(item.path) : false}
                  ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                />
              ))}
            </NavList>
          )}
          </nav>
        )}
      </div>
      <main className="vrm-main">
        <div className="vrm-content">{children || <Outlet />}</div>
      </main>
    </div>
  );
};
export default VRMLayout;
