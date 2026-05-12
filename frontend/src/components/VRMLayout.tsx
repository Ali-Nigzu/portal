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
import camOSLogo from "../assets/Untitled design (4).svg";
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
import SettingsSecondaryNav from "../features/settings/components/SettingsSecondaryNav";
import MobileSidebarRow from "./MobileSidebarRow";

type MobileSidebarOpen = null | "primary" | "site";
type MobileDrawer =
  | { kind: "closed" }
  | { kind: "primary" }
  | { kind: "site-selector" }
  | { kind: "site-menu"; siteId: string };
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] =
    useState<MobileSidebarOpen>(null);
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawer>({ kind: "closed" });
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
  const isSiteMenuForceExpandIntent =
    searchParams.get("site_menu_expand_once") === "1";
  const activeSite = findSiteById(siteId);
  const isDemoSession = isDemoSessionActive();
  const siteRoutePrefix = location.pathname.startsWith("/demo/") ? "/demo" : "/sites";
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
  const isSameMobileRoute = (targetPath: string) => {
    const [targetPathnameRaw, targetSearchRaw = ""] = targetPath.split("?");
    const normalizePath = (value: string) => {
      if (!value) return "/";
      const trimmed = value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
      return trimmed || "/";
    };
    const normalizeSearch = (search: string) => {
      const params = new URLSearchParams(search);
      ["panel", "expand_once", "site_menu_expand_once"].forEach((key) => params.delete(key));
      return Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
    };
    return (
      normalizePath(location.pathname) === normalizePath(targetPathnameRaw) &&
      normalizeSearch(location.search) === normalizeSearch(targetSearchRaw)
    );
  };
  const openSitesSelector = () => {
    const isCurrentPathSites = /^\/(?:sites|demo)(?:\/|$)/.test(location.pathname);
    const resolvedSiteId = siteId ?? getStoredSiteId() ?? "all";
    navigate(
      {
        pathname: isCurrentPathSites
          ? location.pathname
          : `${siteRoutePrefix}/${resolvedSiteId}/dashboard`,
        search: buildSearch({ panel: "sites" }),
      },
      { replace: isDemoSession },
    );
  };
  const handleSitesClick = () => {
    if (isMobileViewport) {
      setMobileDrawer({ kind: "site-selector" });
      setMobileSidebarOpen("site");
      return;
    }
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
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    const syncMobileViewport = () => {
      setIsMobileViewport(mobileQuery.matches);
    };
    syncMobileViewport();
    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener("change", syncMobileViewport);
    } else {
      mobileQuery.addListener(syncMobileViewport);
    }

    const mediaQuery = window.matchMedia(
      "(hover: none), (pointer: coarse)",
    );
    const syncTouchMode = () => {
      const isTouch = mediaQuery.matches;
      setIsTouchMode(isTouch);
    };
    syncTouchMode();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", syncTouchMode);
      return () => {
        mediaQuery.removeEventListener("change", syncTouchMode);
        if (mobileQuery.addEventListener) {
          mobileQuery.removeEventListener("change", syncMobileViewport);
        } else {
          mobileQuery.removeListener(syncMobileViewport);
        }
      };
    }
    mediaQuery.addListener(syncTouchMode);
    return () => {
      mediaQuery.removeListener(syncTouchMode);
      if (mobileQuery.addEventListener) {
        mobileQuery.removeEventListener("change", syncMobileViewport);
      } else {
        mobileQuery.removeListener(syncMobileViewport);
      }
    };
  }, []);
  useEffect(() => {
    setMobileSidebarOpen(null);
    setMobileDrawer({ kind: "closed" });
  }, [isMobileViewport]);
  const openPrimaryDrawer = () => {
    setMobileDrawer({ kind: "primary" });
    setMobileSidebarOpen("primary");
  };
  const openSiteSelectorDrawer = () => {
    setMobileDrawer({ kind: "site-selector" });
    setMobileSidebarOpen("site");
  };
  const openSiteMenuDrawer = (nextSiteId: string) => {
    setMobileDrawer({ kind: "site-menu", siteId: nextSiteId });
    setMobileSidebarOpen("site");
  };
  const openSecondaryDrawerForCurrentContext = () => {
    if (siteId) {
      openSiteMenuDrawer(siteId);
      return;
    }
    openSiteSelectorDrawer();
  };
  const closeMobileDrawer = () => {
    setMobileDrawer({ kind: "closed" });
    setMobileSidebarOpen(null);
  };
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
        disabled: isDemoSession,
      },
      {
        path: `${siteRoutePrefix}`,
        label: "Sites",
        icon: <NavIcon icon={MapPin} />,
      },
    ],
    [isDemoSession, siteRoutePrefix],
  );
  const clientNavigationItems = useMemo(
    () => [
      {
        path: siteId ? `${siteRoutePrefix}/${siteId}/dashboard` : undefined,
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
        path: siteId ? `${siteRoutePrefix}/${siteId}/event-logs` : undefined,
        label: "Event Logs",
        icon: <NavIcon icon={ClipboardList} />,
      },
      {
        path: siteId ? `${siteRoutePrefix}/${siteId}/alarm-logs` : undefined,
        label: "Alarm Logs",
        icon: <NavIcon icon={Bell} />,
      },
      {
        path: siteId ? `${siteRoutePrefix}/${siteId}/device-list` : undefined,
        label: "Device List",
        icon: <NavIcon icon={Cpu} />,
      },
      {
        path: siteId ? `${siteRoutePrefix}/${siteId}/reports` : undefined,
        label: "Reports",
        icon: <NavIcon icon={FileBarChart2} />,
      },
    ],
    [siteId, siteRoutePrefix],
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
  const showSiteMenuMobile =
    mobileDrawer.kind === "site-menu" ||
    (mobileDrawer.kind === "site-selector" ? false : showSiteMenu);
  const isHomeRoute = location.pathname === "/home";
  const isDocumentsRoute =
    location.pathname === "/documents" || location.pathname.startsWith("/documents/");
  const isSitesRoute = /^\/(?:sites|demo)(?:\/|$)/.test(location.pathname);
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const shouldRenderSecondaryPanel =
    isSettingsRoute || (!isDocumentsRoute && (!isHomeRoute || isSelectorOpen));
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
  const primarySitesIntentOpen = sitesIntentOpen;
  const secondarySitesIntentOpen = sitesIntentOpen || isSelectorOpen;
  const shouldForceCollapse =
    !keepMenuExpanded &&
    pointerZone === "OUTSIDE" &&
    focusZone === "OUTSIDE" &&
    !secondarySitesIntentOpen;
  const isPrimaryExpandedDesktop =
    keepMenuExpanded ||
    pointerZone === "PRIMARY" ||
    pointerZone === "SITES_ROW" ||
    focusZone === "PRIMARY" ||
    primarySitesIntentOpen;
  const isSecondaryExpandedDesktop = forcedSitesExpandOnceActive
    ? true
    : !shouldForceCollapse &&
      (keepMenuExpanded ||
        pointerZone === "SITES_ROW" ||
        pointerZone === "SECONDARY" ||
        focusZone === "SECONDARY" ||
        secondarySitesIntentOpen);
  const isPrimaryExpanded = isMobileViewport
    ? mobileSidebarOpen === "primary"
    : isPrimaryExpandedDesktop;
  const isSecondaryExpanded = isMobileViewport
    ? mobileSidebarOpen === "site"
    : isSecondaryExpandedDesktop;
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
    if ((!isSelectorOpen && !forcedSitesExpandOnceActive) || typeof window === "undefined") {
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
    if (!isSitesRoute) {
      setForcedSitesExpandOnceActive(false);
      return;
    }

    if (!isSelectorOpen || !isForceExpandIntent) {
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
    if (!isSitesRoute || isSelectorOpen) {
      return;
    }

    if (!isSiteMenuForceExpandIntent) {
      return;
    }

    setForcedSitesExpandOnceActive(true);

    navigate(
      {
        pathname: location.pathname,
        search: buildSearch({ site_menu_expand_once: undefined }),
      },
      { replace: true },
    );
  }, [
    buildSearch,
    isSelectorOpen,
    isSiteMenuForceExpandIntent,
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
  const closeMobileSidebar = () => {
    if (!isMobileViewport) {
      return;
    }
    closeMobileDrawer();
  };
  const handleMobileSidebarIntent = (
    event: React.MouseEvent<HTMLElement>,
    targetSidebar: Exclude<MobileSidebarOpen, null>,
  ) => {
    if (!isMobileViewport) {
      return false;
    }
    if (mobileSidebarOpen !== targetSidebar) {
      event.preventDefault();
      event.stopPropagation();
      if (targetSidebar === "primary") {
        openPrimaryDrawer();
      } else {
        openSecondaryDrawerForCurrentContext();
      }
      return true;
    }
    return false;
  };
  const handleSecondaryNavClick = (event: React.MouseEvent<HTMLElement>) => {
    handleMobileSidebarIntent(event, "site");
  };
  const handleMobilePanelPointerDown = (
    event: React.PointerEvent<HTMLElement>,
    panel: Exclude<MobileSidebarOpen, null>,
  ) => {
    if (!isMobileViewport) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-mobile-sidebar-explicit-close='true']")) {
      return;
    }
    if (target.closest("[data-mobile-sidebar-row='true']")) {
      return;
    }
    if (mobileSidebarOpen !== panel) {
      event.preventDefault();
      event.stopPropagation();
      if (panel === "primary") {
        openPrimaryDrawer();
      } else {
        openSecondaryDrawerForCurrentContext();
      }
    }
  };
  const handleMobileActionRowClick = (
    event: React.MouseEvent<HTMLElement>,
    targetPath: string,
    panel: Exclude<MobileSidebarOpen, null>,
    isRowActive: boolean,
  ) => {
    if (!isMobileViewport) return;
    event.preventDefault();
    event.stopPropagation();
    if (mobileSidebarOpen !== panel) {
      // On touch screens a single tap should navigate, even if the panel was
      // not already expanded. Keeping this as open-only required a second tap
      // and made row-strip taps appear unresponsive.
      if (panel === "primary") {
        openPrimaryDrawer();
      } else {
        openSecondaryDrawerForCurrentContext();
      }
    }
    const isSameRoute = isSameMobileRoute(targetPath);
    if (isSameRoute && isRowActive) {
      return;
    }
    navigate(targetPath, { replace: isDemoSession });
    closeMobileDrawer();
  };
  useEffect(() => {
    if (!isMobileViewport || mobileSidebarOpen === null) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobileViewport, mobileSidebarOpen]);
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
    <div
      className={`vrm-layout ${isMobileViewport ? "vrm-layout--mobile" : ""} ${
        isMobileViewport && mobileSidebarOpen === "primary"
          ? "vrm-layout--mobile-primary-open"
          : ""
      } ${
        isMobileViewport && mobileSidebarOpen === "site"
          ? "vrm-layout--mobile-site-open"
          : ""
      }`}
    >
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
        } ${
          !shouldRenderSecondaryPanel ? "vrm-sidebar-shell--no-secondary" : ""
        }`}
        aria-label="Primary"
      >
        <nav
          id="vrm-primary-rail"
          className="vrm-primary-rail"
          aria-label="Primary"
          aria-expanded={isMobileViewport ? mobileSidebarOpen === "primary" : undefined}
          ref={primaryRailRef}
          onFocusCapture={() => setIsPrimaryFocused(true)}
          onBlurCapture={handleFocusChange(setIsPrimaryFocused)}
          onPointerDown={(event) => handleMobilePanelPointerDown(event, "primary")}
          data-mobile-sidebar-panel="primary"
          data-mobile-sidebar-switch={
            isMobileViewport && mobileSidebarOpen !== "primary" ? "primary" : undefined
          }
        >
          <div className="vrm-sidebar-header vrm-sidebar-header--brand">
            {isMobileViewport && mobileSidebarOpen === "primary" && (
              <button
                type="button"
                className="vrm-sidebar-mobile-close-button"
                data-mobile-sidebar-explicit-close="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMobileSidebar();
                }}
                aria-label="Close primary sidebar"
              >
                ✕
              </button>
            )}
            <div className="vrm-brand-header">
              <div className="vrm-logo">
                <img src={camOSLogo} alt="camOS" className="vrm-logo-img" />
              </div>
              <div className="vrm-brand-text">
                <div className="vrm-brand-title">camOS</div>
                {isDemoSession && (
                  <div className="vrm-brand-subrow">
                    <span className="vrm-brand-badge" aria-label="Demo">
                      DEMO
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div data-mobile-sidebar-protected="true">
          <NavList className="vrm-primary-nav">
            {primaryNavigationItems.map((item) => {
              const isActive = primaryActivePath === item.path;
              const navRow = (
                isMobileViewport ? (
                <MobileSidebarRow
                  key={item.path ?? item.label}
                  icon={item.icon}
                  label={item.label}
                  active={isActive}
                  disabled={item.disabled}
                  ariaLabel={!isPrimaryExpanded ? item.label : undefined}
                  rightSlot={
                    item.path === siteRoutePrefix ? (
                      <NavIcon icon={ChevronRight} className="vrm-nav-chevron" />
                    ) : undefined
                  }
                  onTap={
                    item.disabled
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      : item.path === siteRoutePrefix
                        ? (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (mobileSidebarOpen !== "primary") {
                              openPrimaryDrawer();
                              return;
                            }
                            openSiteSelectorDrawer();
                          }
                        : item.path
                          ? (event) =>
                              handleMobileActionRowClick(
                                event,
                                getNavigationPath(item.path),
                                "primary",
                                isActive,
                              )
                          : (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }
                  }
                />
                ) : (
                <NavRow
                  key={item.path ?? item.label}
                  to={
                    item.disabled || !item.path || item.path === siteRoutePrefix
                      ? undefined
                      : getNavigationPath(item.path)
                  }
                  replace={Boolean(item.path) && isDemoSession}
                  onClick={
                    item.disabled
                      ? undefined
                      : item.path === siteRoutePrefix
                        ? handleSitesClick
                        : item.path
                          ? (event) =>
                              handleMobileActionRowClick(
                                event,
                                getNavigationPath(item.path),
                                "primary",
                                isActive,
                              )
                          : undefined
                  }
                  icon={item.icon}
                  label={item.label}
                  active={isActive}
                  disabled={item.disabled}
                  ariaLabel={!isPrimaryExpanded ? item.label : undefined}
                  rightSlot={
                    item.path === siteRoutePrefix ? (
                      <NavIcon icon={ChevronRight} className="vrm-nav-chevron" />
                    ) : undefined
                  }
                  onTap={
                    item.disabled
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      : item.path === siteRoutePrefix
                        ? (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (mobileSidebarOpen !== "primary") {
                              openPrimaryDrawer();
                              return;
                            }
                            openSiteSelectorDrawer();
                          }
                        : item.path
                          ? (event) =>
                              handleMobileActionRowClick(
                                event,
                                getNavigationPath(item.path),
                                "primary",
                                isActive,
                              )
                          : (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }
                  }
                />
                )
              );
              if (item.path !== siteRoutePrefix) {
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
            {isMobileViewport ? (
              <MobileSidebarRow
                icon={<NavIcon icon={FileText} />}
                label="Documents"
                disabled={!isAuthenticated || isDemoSession}
                className={isAuthenticated ? undefined : "vrm-nav-row--placeholder"}
                ariaLabel={!isPrimaryExpanded ? "Documents" : undefined}
                onTap={(event) =>
                  handleMobileActionRowClick(event, getNavigationPath("/documents"), "primary", false)
                }
              />
            ) : (
              <NavRow
                to={isAuthenticated ? getNavigationPath("/documents") : undefined}
                leftIcon={<NavIcon icon={FileText} />}
                label="Documents"
                disabled={!isAuthenticated || isDemoSession}
                mobileSidebarDisabled={!isAuthenticated || isDemoSession}
                className={isAuthenticated ? undefined : "vrm-nav-row--placeholder"}
                ariaLabel={!isPrimaryExpanded ? "Documents" : undefined}
                onClick={(event) =>
                  handleMobileActionRowClick(event, getNavigationPath("/documents"), "primary", false)
                }
                mobileSidebarAction="primary"
              />
            )}
            {!isMobileViewport && (
              <NavRow
                leftIcon={toggleIcon}
                label={toggleLabel}
                onClick={handleKeepExpandedToggle}
                active={keepMenuExpanded}
                className="vrm-nav-row--toggle"
                ariaLabel={!isPrimaryExpanded ? toggleLabel : undefined}
              />
            )}
            {isMobileViewport ? (
              <MobileSidebarRow
                icon={<NavIcon icon={Settings} />}
                label="Settings"
                disabled={!isAuthenticated || isDemoSession}
                className={isAuthenticated ? undefined : "vrm-nav-row--placeholder"}
                ariaLabel={!isPrimaryExpanded ? "Settings" : undefined}
                onTap={(event) =>
                  handleMobileActionRowClick(event, getNavigationPath("/settings/account"), "primary", false)
                }
              />
            ) : (
              <NavRow
                to={isAuthenticated ? getNavigationPath("/settings/account") : undefined}
                leftIcon={<NavIcon icon={Settings} />}
                label="Settings"
                disabled={!isAuthenticated || isDemoSession}
                mobileSidebarDisabled={!isAuthenticated || isDemoSession}
                className={isAuthenticated ? undefined : "vrm-nav-row--placeholder"}
                ariaLabel={!isPrimaryExpanded ? "Settings" : undefined}
                onClick={(event) =>
                  handleMobileActionRowClick(event, getNavigationPath("/settings/account"), "primary", false)
                }
                mobileSidebarAction="primary"
              />
            )}
            {showLogout &&
              (isMobileViewport ? (
                <MobileSidebarRow
                  icon={<NavIcon icon={LogOut} />}
                  label="Logout"
                  className="vrm-nav-row--interactive"
                  ariaLabel={!isPrimaryExpanded ? "Logout" : undefined}
                  onTap={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (mobileSidebarOpen !== "primary") {
                      openPrimaryDrawer();
                      return;
                    }
                    handleLogoutClick();
                    closeMobileDrawer();
                  }}
                />
              ) : (
                <NavRow
                  onClick={handleLogoutClick}
                  leftIcon={<NavIcon icon={LogOut} />}
                  label="Logout"
                  className="vrm-nav-row--interactive"
                  ariaLabel={!isPrimaryExpanded ? "Logout" : undefined}
                />
              ))}
          </NavList>
          </div>
        </nav>
        {shouldRenderSecondaryPanel && (
          <nav
          id="vrm-secondary-panel"
          className="vrm-extended-panel"
          aria-label="Secondary"
          aria-expanded={isMobileViewport ? mobileSidebarOpen === "site" : undefined}
          ref={secondaryPanelRef}
          onFocusCapture={() => setIsSecondaryFocused(true)}
          onBlurCapture={handleFocusChange(setIsSecondaryFocused)}
          onPointerEnter={cancelSitesLeaveTimer}
          onPointerLeave={handleSitesRowLeave}
          onPointerDown={(event) => handleMobilePanelPointerDown(event, "site")}
          data-mobile-sidebar-panel="site"
          data-mobile-sidebar-switch={
            isMobileViewport && mobileSidebarOpen !== "site" ? "site" : undefined
          }
          data-mobile-sidebar-blank="true"
        >
          {isSettingsRoute ? (
            <SettingsSecondaryNav />
          ) : (
            <>
          <div className="vrm-secondary-header">
            {isMobileViewport && mobileSidebarOpen === "site" && (
              <button
                type="button"
                className="vrm-sidebar-mobile-close-button"
                data-mobile-sidebar-explicit-close="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMobileSidebar();
                }}
                aria-label="Close site sidebar"
              >
                ✕
              </button>
            )}
            <SecondarySearch />
            {!(isMobileViewport ? showSiteMenuMobile : showSiteMenu) && (
              <div data-mobile-sidebar-protected="true">
              {isMobileViewport ? (
              <MobileSidebarRow
                icon={<NavIcon icon={MapPin} />}
                label={allSitesOption.label}
                active={
                  isSiteSelection && allSitesOption.id === selectedSiteForList
                }
                onTap={(event) =>
                  handleMobileActionRowClick(
                    event,
                    getNavigationPath(`${siteRoutePrefix}/${allSitesOption.id}/dashboard`, {
                      panel: undefined,
                    }),
                    "site",
                    isSiteSelection && allSitesOption.id === selectedSiteForList,
                  )
                }
              />
              ) : (
              <SecondaryPinnedRow
                to={getNavigationPath(
                  `${siteRoutePrefix}/${allSitesOption.id}/dashboard`,
                  { panel: undefined },
                )}
                replace={isDemoSession}
                leftIcon={<NavIcon icon={MapPin} />}
                label={allSitesOption.label}
                active={
                  isSiteSelection && allSitesOption.id === selectedSiteForList
                }
                onClick={(event) =>
                  handleMobileActionRowClick(
                    event,
                    getNavigationPath(`${siteRoutePrefix}/${allSitesOption.id}/dashboard`, {
                      panel: undefined,
                    }),
                    "site",
                    isSiteSelection && allSitesOption.id === selectedSiteForList,
                  )
                }
                mobileSidebarAction="site"
              />
              )}
              </div>
            )}
            {(isMobileViewport ? showSiteMenuMobile : showSiteMenu) &&
              (isMobileViewport ? (
                <MobileSidebarRow
                  icon={
                    <span className="vrm-nav-row__icon-stack">
                      <NavIcon icon={ArrowLeft} className="vrm-nav-back" size={18} />
                      <NavIcon icon={MapPin} />
                    </span>
                  }
                  label={activeSite?.label ?? "Site"}
                  onTap={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (mobileSidebarOpen !== "site") {
                      openSiteSelectorDrawer();
                      return;
                    }
                    openSitesSelector();
                  }}
                />
              ) : (
                <SecondaryPinnedRow
                  leftIcon={
                    <span className="vrm-nav-row__icon-stack">
                      <NavIcon icon={ArrowLeft} className="vrm-nav-back" size={18} />
                      <NavIcon icon={MapPin} />
                    </span>
                  }
                  label={activeSite?.label ?? "Site"}
                  onClick={(event) => {
                    const blocked = handleMobileSidebarIntent(event, "site");
                    if (!blocked) {
                      openSitesSelector();
                    }
                  }}
                />
              ))}
            <SecondaryDivider />
          </div>
          {!(isMobileViewport ? showSiteMenuMobile : showSiteMenu) && (
            <div data-mobile-sidebar-protected="true">
            <NavList className="vrm-secondary-list">
              {selectorSiteOptions.map((site) => {
                const siteSubPath = (() => {
                  const match = location.pathname.match(/^\/(?:sites|demo)\/[^/]+(\/.*)?$/);
                  const trailing = match?.[1];
                  if (!trailing || trailing === "/") {
                    return "/dashboard";
                  }
                  return trailing;
                })();
                const siteTargetPath = `${siteRoutePrefix}/${site.id}${siteSubPath}`;
                const isActive =
                  isSiteSelection && site.id === selectedSiteForList;
                return (
                    isMobileViewport ? (
                  <MobileSidebarRow
                    key={site.id}
                    icon={<NavIcon icon={MapPin} />}
                    label={site.label}
                    active={isActive}
                    ariaLabel={!isSecondaryExpanded ? site.label : undefined}
                    onTap={(event) =>
                      handleMobileActionRowClick(
                        event,
                        getNavigationPath(siteTargetPath, { panel: undefined }),
                        "site",
                        isActive,
                      )
                    }
                  />
                  ) : (
                  <NavRow
                    key={site.id}
                    to={getNavigationPath(siteTargetPath, { panel: undefined })}
                    replace={isDemoSession}
                    leftIcon={<NavIcon icon={MapPin} />}
                    label={site.label}
                    active={isActive}
                    ariaLabel={!isSecondaryExpanded ? site.label : undefined}
                    onClick={(event) =>
                      handleMobileActionRowClick(
                        event,
                        getNavigationPath(siteTargetPath, { panel: undefined }),
                        "site",
                        isActive,
                      )
                    }
                    mobileSidebarAction="site"
                  />
                  )
                );
              })}
              {isMobileViewport ? (
                <MobileSidebarRow
                  icon={<NavIcon icon={Plus} />}
                  label="Add site"
                  className="vrm-nav-row--inert"
                  disabled
                  ariaLabel={!isSecondaryExpanded ? "Add site" : undefined}
                  onTap={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                />
              ) : (
                <NavRow
                  leftIcon={<NavIcon icon={Plus} />}
                  label="Add site"
                  className="vrm-nav-row--inert"
                  ariaLabel={!isSecondaryExpanded ? "Add site" : undefined}
                />
              )}
            </NavList>
            </div>
          )}
          {(isMobileViewport ? showSiteMenuMobile : showSiteMenu) && !shouldShowAdminMenu && (
            <div data-mobile-sidebar-protected="true">
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
                  return isMobileViewport ? (
                    <MobileSidebarRow
                      key={item.id ?? item.label}
                      icon={item.icon}
                      label={navLabel}
                      disabled
                      ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                      onTap={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    />
                  ) : (
                    <NavRow
                      key={item.id ?? item.label}
                      leftIcon={item.icon}
                      label={navLabel}
                      disabled
                      mobileSidebarDisabled
                      ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                    />
                  );
                }
                if (!item.path) {
                  return null;
                }
                return isMobileViewport ? (
                  <MobileSidebarRow
                    key={item.path}
                    icon={item.icon}
                    label={navLabel}
                    active={isActive}
                    ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                    onTap={(event) =>
                      handleMobileActionRowClick(
                        event,
                        getNavigationPath(item.path),
                        "site",
                        isActive,
                      )
                    }
                  />
                ) : (
                  <NavRow
                    key={item.path}
                    to={getNavigationPath(item.path)}
                    replace={isDemoSession}
                    leftIcon={item.icon}
                    label={navLabel}
                    active={isActive}
                    ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                    onClick={(event) =>
                      handleMobileActionRowClick(event, getNavigationPath(item.path), "site", item.path ? isActiveRoute(item.path) : false)
                    }
                    mobileSidebarAction="site"
                  />
                );
              })}
            </NavList>
            </div>
          )}
          {shouldShowAdminMenu && (
            <div data-mobile-sidebar-protected="true">
            <NavList className="vrm-secondary-list">
              {adminNavigationItems.map((item) =>
                isMobileViewport ? (
                  <MobileSidebarRow
                    key={item.path}
                    icon={item.icon}
                    label={item.label}
                    active={item.path ? isActiveRoute(item.path) : false}
                    ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                    onTap={(event) =>
                      handleMobileActionRowClick(
                        event,
                        getNavigationPath(item.path),
                        "site",
                        item.path ? isActiveRoute(item.path) : false,
                      )
                    }
                  />
                ) : (
                  <NavRow
                    key={item.path}
                    to={getNavigationPath(item.path)}
                    replace={isDemoSession}
                    leftIcon={item.icon}
                    label={item.label}
                    active={item.path ? isActiveRoute(item.path) : false}
                    ariaLabel={!isSecondaryExpanded ? item.label : undefined}
                    onClick={(event) =>
                      handleMobileActionRowClick(event, getNavigationPath(item.path), "site", item.path ? isActiveRoute(item.path) : false)
                    }
                    mobileSidebarAction="site"
                  />
                ),
              )}
            </NavList>
            </div>
          )}
            </>
          )}
          </nav>
        )}
      </div>
      {isMobileViewport && mobileSidebarOpen !== null && (
        <button
          type="button"
          className="vrm-sidebar-mobile-backdrop"
          aria-label="Close sidebar"
          onPointerDown={closeMobileSidebar}
        />
      )}
      <main className={`vrm-main ${isMobileViewport ? "vrm-main--mobile-lane" : ""}`}>
        <div className={`vrm-content ${isMobileViewport ? "vrm-content--mobile-lane" : ""}`}>
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
};
export default VRMLayout;
