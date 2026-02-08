import React, { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  FileBarChart2,
  Home,
  LayoutDashboard,
  MapPin,
  Plus,
  Settings,
  Shield,
  TrendingUp,
  Upload,
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
  children?: React.ReactNode;
}
const VRMLayout: React.FC<VRMLayoutProps> = ({
  userRole = "client",
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
  const [debugState, setDebugState] = useState<{
    pointerZone: "OUTSIDE" | "PRIMARY" | "SITES_ROW" | "SECONDARY";
    expandPrimary: boolean;
    mountSecondary: boolean;
    expandSecondary: boolean;
    isPrimaryHovered: boolean;
    isSitesRowHovered: boolean;
    isSecondaryHovered: boolean;
    activeElementLocation: "PRIMARY" | "SECONDARY" | "OUTSIDE";
    rects: {
      primary: DOMRect | null;
      secondary: DOMRect | null;
      shell: DOMRect | null;
    };
    lastEvent: {
      targetClassName: string;
      currentTargetClassName: string;
    };
  } | null>(null);
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
  const isSelectorOpen = searchParams.get("panel") === "sites";
  const activeSite = findSiteById(siteId);
  const allSitesOption =
    SITE_OPTIONS.find((site) => site.id === "all") ?? SITE_OPTIONS[0];
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
      { replace: false },
    );
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
        label: "Home",
        icon: <NavIcon icon={Home} />,
        placeholder: true,
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
  const shouldShowAdminMenu =
    userRole === "admin" && location.pathname.startsWith("/admin");
  const isSitesActive = primaryActivePath === "/sites";
  const isPrimaryHovered =
    pointerZone === "PRIMARY" || pointerZone === "SITES_ROW";
  const isSitesRowHovered = pointerZone === "SITES_ROW";
  const isSecondaryHovered = pointerZone === "SECONDARY";
  const focusZone = isSecondaryFocused
    ? "SECONDARY"
    : isPrimaryFocused
      ? "PRIMARY"
      : "OUTSIDE";
  const shouldShowSitesPanel =
    isSitesActive ||
    pointerZone === "SITES_ROW" ||
    pointerZone === "SECONDARY" ||
    focusZone === "SECONDARY";
  const isPrimaryExpanded =
    keepMenuExpanded ||
    pointerZone === "PRIMARY" ||
    pointerZone === "SITES_ROW" ||
    focusZone === "PRIMARY";
  const isSecondaryExpanded =
    keepMenuExpanded || pointerZone === "SECONDARY" || focusZone === "SECONDARY";
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
  const debugNavEnabled = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return (
      import.meta.env.DEV && window.localStorage.getItem("DEBUG_NAV") === "1"
    );
  }, []);
  const lastPointerEventRef = useRef<{
    type: string;
    x: number;
    y: number;
    targetClassName: string;
    currentTargetClassName: string;
  } | null>(null);
  const logDebugEvent = useMemo(
    () =>
      (
        eventType: string,
        zone: "OUTSIDE" | "PRIMARY" | "SITES_ROW" | "SECONDARY",
        x: number,
        y: number,
        expPrimary: boolean,
        mountSecondary: boolean,
        expSecondary: boolean,
      ) => {
        if (!debugNavEnabled) {
          return;
        }
        const activeElement = document.activeElement as HTMLElement | null;
        const activeLabel = activeElement
          ? `${activeElement.tagName.toLowerCase()}${
              activeElement.className ? `.${activeElement.className}` : ""
            }`
          : "none";
        const time = Math.round(performance.now());
        // eslint-disable-next-line no-console
        console.info(
          `t=${time} evt=${eventType} zone=${zone} x=${Math.round(
            x,
          )} y=${Math.round(y)} expP=${expPrimary ? 1 : 0} mountS=${
            mountSecondary ? 1 : 0
          } expS=${expSecondary ? 1 : 0} focusP=${
            isPrimaryFocused ? 1 : 0
          } focusS=${isSecondaryFocused ? 1 : 0} active=${activeLabel}`,
        );
      },
    [debugNavEnabled, isPrimaryFocused, isSecondaryFocused],
  );

  useEffect(() => {
    if (keepMenuExpanded || typeof window === "undefined") {
      return;
    }
    const secondaryPanel = document.querySelector(".vrm-extended-panel");
    const isFocused = secondaryPanel?.matches(":focus-within") ?? false;
    setIsSecondaryFocused(isFocused);
  }, [keepMenuExpanded, location.pathname, siteId]);
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

      if (debugNavEnabled) {
        const target = event.target as HTMLElement | null;
        const currentTarget = event.currentTarget as HTMLElement | null;
        lastPointerEventRef.current = {
          type: event.type,
          x: event.clientX,
          y: event.clientY,
          targetClassName: target?.className ?? "",
          currentTargetClassName: currentTarget?.className ?? "",
        };
        const activeElement = document.activeElement as HTMLElement | null;
        const activeElementLocation = activeElement
          ? secondaryPanelRef.current?.contains(activeElement)
            ? "SECONDARY"
            : primaryRailRef.current?.contains(activeElement)
              ? "PRIMARY"
              : "OUTSIDE"
          : "OUTSIDE";
        setDebugState({
          pointerZone: zoneForState,
          expandPrimary:
            keepMenuExpanded ||
            zoneForState === "PRIMARY" ||
            zoneForState === "SITES_ROW" ||
            focusZone === "PRIMARY",
          mountSecondary:
            isSitesActive ||
            zoneForState === "SECONDARY" ||
            zoneForState === "SITES_ROW" ||
            focusZone === "SECONDARY",
          expandSecondary:
            keepMenuExpanded ||
            zoneForState === "SECONDARY" ||
            focusZone === "SECONDARY",
          isPrimaryHovered:
            zoneForState === "PRIMARY" || zoneForState === "SITES_ROW",
          isSitesRowHovered: zoneForState === "SITES_ROW",
          isSecondaryHovered: zoneForState === "SECONDARY",
          activeElementLocation,
          rects: {
            primary: primaryRect ?? null,
            secondary: secondaryRect ?? null,
            shell: shellRect ?? null,
          },
          lastEvent: {
            targetClassName: target?.className ?? "",
            currentTargetClassName: currentTarget?.className ?? "",
          },
        });
        logDebugEvent(
          event.type,
          zoneForState,
          event.clientX,
          event.clientY,
          keepMenuExpanded ||
            zoneForState === "PRIMARY" ||
            zoneForState === "SITES_ROW" ||
            focusZone === "PRIMARY",
          isSitesActive ||
            zoneForState === "SECONDARY" ||
            zoneForState === "SITES_ROW" ||
            focusZone === "SECONDARY",
          keepMenuExpanded ||
            zoneForState === "SECONDARY" ||
            focusZone === "SECONDARY",
        );
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
      if (
        !keepMenuExpanded &&
        !pointerInsideSidebarRef.current &&
        secondaryPanelRef.current &&
        document.activeElement instanceof HTMLElement &&
        secondaryPanelRef.current.contains(document.activeElement)
      ) {
        document.activeElement.blur();
        setIsSecondaryFocused(false);
      }
      if (debugNavEnabled) {
        logDebugEvent(
          event.type,
          pointerZoneRef.current,
          event.clientX,
          event.clientY,
          isPrimaryExpanded,
          shouldShowSitesPanel,
          isSecondaryExpanded,
        );
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [
    debugNavEnabled,
    focusZone,
    isPrimaryExpanded,
    isSecondaryExpanded,
    isSitesActive,
    isTouchMode,
    keepMenuExpanded,
    logDebugEvent,
    shouldShowSitesPanel,
  ]);
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
  return (
    <div className="vrm-layout">
      <div
        ref={sidebarShellRef}
        className={`vrm-sidebar-shell ${
          shouldShowSitesPanel ? "vrm-sidebar-shell--sites" : ""
        } ${
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
          !keepMenuExpanded && shouldShowSitesPanel && !isSecondaryExpanded
            ? "vrm-sidebar-shell--secondary-collapsed"
            : ""
        } ${
          !keepMenuExpanded && shouldShowSitesPanel && isSecondaryExpanded
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
                  onClick={item.path === "/sites" ? openSitesSelector : undefined}
                  leftIcon={item.icon}
                  label={item.label}
                  active={isActive}
                  className={
                    item.placeholder ? "vrm-nav-row--placeholder" : undefined
                  }
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
              leftIcon={<NavIcon icon={Upload} />}
              label="Upload"
              className="vrm-nav-row--placeholder"
              ariaLabel={!isPrimaryExpanded ? "Upload" : undefined}
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
          </NavList>
        </nav>
        {shouldShowSitesPanel && (
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
                  leftIcon={<NavIcon icon={MapPin} />}
                  label={allSitesOption.label}
                  active={
                    isSiteSelection &&
                    allSitesOption.id === selectedSiteForList
                  }
                />
              )}
              {showSiteMenu && (
                <SecondaryPinnedRow
                  onClick={openSitesSelector}
                  leftIcon={
                    <span className="vrm-nav-row__icon-stack">
                      <NavIcon
                        icon={ArrowLeft}
                        className="vrm-nav-back"
                        size={18}
                      />
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
                {SITE_OPTIONS.filter((site) => site.id !== "all").map(
                  (site) => {
                  const siteSubPath = (() => {
                    const match = location.pathname.match(
                      /^\/sites\/[^/]+(\/.*)?$/,
                    );
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
                      to={getNavigationPath(siteTargetPath, {
                        panel: undefined,
                      })}
                      leftIcon={<NavIcon icon={MapPin} />}
                      label={site.label}
                      active={isActive}
                      ariaLabel={!isSecondaryExpanded ? site.label : undefined}
                    />
                  );
                },
                )}
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
                        ariaLabel={
                          !isSecondaryExpanded ? item.label : undefined
                        }
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
      {debugNavEnabled && debugState && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.75)",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            lineHeight: 1.4,
            maxWidth: 360,
            pointerEvents: "none",
          }}
        >
          <div>zone: {debugState.pointerZone}</div>
          <div>
            expP: {debugState.expandPrimary ? "1" : "0"} / mountS:{" "}
            {debugState.mountSecondary ? "1" : "0"} / expS:{" "}
            {debugState.expandSecondary ? "1" : "0"}
          </div>
          <div>
            hoverP: {debugState.isPrimaryHovered ? "1" : "0"} / hoverSites:{" "}
            {debugState.isSitesRowHovered ? "1" : "0"} / hoverS:{" "}
            {debugState.isSecondaryHovered ? "1" : "0"}
          </div>
          <div>active: {debugState.activeElementLocation}</div>
          <div>
            rects P/S/SH:{" "}
            {debugState.rects.primary
              ? `${Math.round(debugState.rects.primary.x)},${Math.round(
                  debugState.rects.primary.y,
                )} ${Math.round(debugState.rects.primary.width)}x${Math.round(
                  debugState.rects.primary.height,
                )}`
              : "null"}{" "}
            |{" "}
            {debugState.rects.secondary
              ? `${Math.round(debugState.rects.secondary.x)},${Math.round(
                  debugState.rects.secondary.y,
                )} ${Math.round(
                  debugState.rects.secondary.width,
                )}x${Math.round(debugState.rects.secondary.height)}`
              : "null"}{" "}
            |{" "}
            {debugState.rects.shell
              ? `${Math.round(debugState.rects.shell.x)},${Math.round(
                  debugState.rects.shell.y,
                )} ${Math.round(debugState.rects.shell.width)}x${Math.round(
                  debugState.rects.shell.height,
                )}`
              : "null"}
          </div>
          <div>
            last evt target: {debugState.lastEvent.targetClassName || "none"}
          </div>
          <div>
            last evt current:{" "}
            {debugState.lastEvent.currentTargetClassName || "none"}
          </div>
        </div>
      )}
      <main className="vrm-main">
        <div className="vrm-content">{children || <Outlet />}</div>
      </main>
    </div>
  );
};
export default VRMLayout;
