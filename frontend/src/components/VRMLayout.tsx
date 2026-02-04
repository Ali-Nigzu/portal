import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import "../styles/VRMTheme.css";
import "../styles/VRMNavigation.css";
import { companyLogoDataUri } from "../assets/companyLogo";
import {
  SITE_OPTIONS,
  findSiteById,
  getStoredSiteId,
  setStoredSiteId,
} from "../lib/sites";
import { getViewTokenFromLocation } from "../lib/viewToken";
import {
  NavList,
  NavRow,
  SecondaryDivider,
  SecondaryPinnedRow,
  SecondarySearch,
} from "../common/components/navigation";
interface VRMLayoutProps {
  userRole?: "client" | "admin";
  children?: React.ReactNode;
}
const IconDashboard = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconAnalytics = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M5 19h2v-6H5v6Zm6 0h2V5h-2v14Zm6 0h2v-9h-2v9ZM4 21h16a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconEventLogs = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M5 4h4l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm0 5v10h14V9H5Zm9 3h3v2h-3v-2Zm-8 0h6v2H6v-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconAlarm = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M12 3a7 7 0 0 0-7 7v3.764l-1.447 2.894A1 1 0 0 0 4.447 18H19.55a1 1 0 0 0 .894-1.447L19 13.764V10a7 7 0 0 0-7-7Zm0 18a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconDevice = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Zm2 0v12h10V6H7Zm2 13h6v2H9v-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconReports = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm8 0v4h4l-4-4ZM8 12h8v2H8v-2Zm0 4h5v2H8v-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconAdmin = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M12 2a5 5 0 0 1 5 5v1.268a3 3 0 0 1 2 2.829V14a3 3 0 0 1-2 2.829V18a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-1.171A3 3 0 0 1 5 14v-2.903a3 3 0 0 1 2-2.83V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v1h6V7a3 3 0 0 0-3-3Zm-1 15h2a1 1 0 0 0 1-1v-1h-4v1a1 1 0 0 0 1 1Zm-4-5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.903a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1V14Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconHome = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M12 3 3 10h2v9a1 1 0 0 0 1 1h5v-6h2v6h5a1 1 0 0 0 1-1v-9h2L12 3Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconSites = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M4 6h7v7H4V6Zm9 0h7v7h-7V6ZM4 15h7v3H4v-3Zm9 0h7v3h-7v-3Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconChevronRight = () => (
  <svg
    className="vrm-nav-chevron"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M9 6.5 14.5 12 9 17.5l1.4 1.4L17.3 12 10.4 5.1 9 6.5Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconBackArrow = () => (
  <svg
    className="vrm-nav-back"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M14.5 6.5 9 12l5.5 5.5 1.4-1.4L11.8 12l4.1-4.1-1.4-1.4Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconSettings = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M19.14 12.94a7.97 7.97 0 0 0 .06-.94 7.97 7.97 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.52 7.52 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94L2.82 14.5a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconUpload = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M12 3 7 8h3v6h4V8h3l-5-5Zm-7 14h14v4H5v-4Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconLogout = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9V3Zm-4.59 6 1.42 1.41L4.66 12H14v2H4.66l2.17 1.59-1.42 1.41L1 12l4.41-5Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconCollapse = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M8 5h8v2H8V5Zm0 12h8v2H8v-2Zm-4-6h12l-3-3 1.41-1.41L20.83 12l-6.42 6.41L13 17l3-3H4v-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconPin = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M14 3c-1.1 0-2 .9-2 2v3.1l-4.7 4.7c-.6.6-.2 1.7.7 1.7H11v5l1 1 1-1v-5h3c.9 0 1.3-1.1.7-1.7L14 8.1V5c0-1.1-.9-2-2-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const IconPlus = () => (
  <svg
    className="vrm-nav-icon"
    viewBox="0 0 24 24"
    role="presentation"
    aria-hidden="true"
  >
    <path
      d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);
const VRMLayout: React.FC<VRMLayoutProps> = ({
  userRole = "client",
  children,
}) => {
  const [isPrimaryHovered, setIsPrimaryHovered] = useState(false);
  const [isSecondaryHovered, setIsSecondaryHovered] = useState(false);
  const [isPrimaryFocused, setIsPrimaryFocused] = useState(false);
  const [isSecondaryFocused, setIsSecondaryFocused] = useState(false);
  const [isTouchMode, setIsTouchMode] = useState(false);
  const [keepMenuExpanded, setKeepMenuExpanded] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const stored = window.localStorage.getItem("vrm_keep_menu_expanded");
    if (stored === null) {
      return true;
    }
    return stored === "true";
  });
  const location = useLocation();
  const { siteId } = useParams();
  const viewToken = getViewTokenFromLocation(location.search);
  const activeSite = findSiteById(siteId);
  const allSitesOption =
    SITE_OPTIONS.find((site) => site.id === "all") ?? SITE_OPTIONS[0];
  const getNavigationPath = (path: string) => {
    return viewToken ? `${path}?view_token=${viewToken}` : path;
  };
  useEffect(() => {
    if (siteId) {
      setStoredSiteId(siteId);
    }
  }, [siteId]);
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
  const primaryNavigationItems = useMemo(
    () => [
      {
        path: "/home",
        label: "Home",
        icon: <IconHome />,
      },
      {
        path: "/sites",
        label: "Sites",
        icon: <IconSites />,
      },
      {
        path: "/settings",
        label: "Settings",
        icon: <IconSettings />,
      },
    ],
    [],
  );
  const clientNavigationItems = useMemo(
    () => [
      {
        path: siteId ? `/sites/${siteId}/dashboard` : undefined,
        label: "Dashboard",
        icon: <IconDashboard />,
        description: "System overview",
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: <IconAnalytics />,
        description: "Advanced analytics",
        disabled: true,
        statusLabel: "Coming Soon",
      },
      {
        id: "forecasts",
        label: "Forecasts",
        icon: <IconAnalytics />,
        description: "Predictive insights",
        disabled: true,
        statusLabel: "Coming Soon",
      },
      {
        path: siteId ? `/sites/${siteId}/event-logs` : undefined,
        label: "Event Logs",
        icon: <IconEventLogs />,
        description: "Activity events",
      },
      {
        path: siteId ? `/sites/${siteId}/alarm-logs` : undefined,
        label: "Alarm Logs",
        icon: <IconAlarm />,
        description: "System alerts",
      },
      {
        path: siteId ? `/sites/${siteId}/device-list` : undefined,
        label: "Device List",
        icon: <IconDevice />,
        description: "Data sources",
      },
      {
        path: siteId ? `/sites/${siteId}/reports` : undefined,
        label: "Reports",
        icon: <IconReports />,
        description: "Analytics reports",
      },
    ],
    [siteId],
  );
  const adminNavigationItems = useMemo(
    () => [
      {
        path: "/admin",
        label: "Admin",
        icon: <IconAdmin />,
        description: "Admin panel",
      },
    ],
    [],
  );
  const isActiveRoute = (path: string) => {
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };
  const primaryActivePath = primaryNavigationItems.find((item) =>
    isActiveRoute(item.path),
  )?.path;
  const isSiteSelection = location.pathname === "/sites";
  const selectedSiteForList = getStoredSiteId() ?? "all";
  const showSiteMenu = Boolean(siteId);
  const shouldShowAdminMenu =
    userRole === "admin" && location.pathname.startsWith("/admin");
  const shouldShowSitesPanel = primaryActivePath === "/sites";
  const isPrimaryExpanded =
    keepMenuExpanded || isPrimaryHovered || isPrimaryFocused;
  const isSecondaryExpanded =
    keepMenuExpanded || isSecondaryHovered || isSecondaryFocused;
  const collapseLabel = "Collapse sidebar";
  const handleKeepExpandedToggle = () => {
    if (isTouchMode) {
      return;
    }
    setKeepMenuExpanded((prev) => !prev);
  };
  const handleCollapseSidebar = () => {
    if (isTouchMode) {
      return;
    }
    setKeepMenuExpanded(false);
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
  return (
    <div className="vrm-layout">
      {" "}
      {}{" "}
      <div
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
          onMouseEnter={() => setIsPrimaryHovered(true)}
          onMouseLeave={() => setIsPrimaryHovered(false)}
          onFocusCapture={() => setIsPrimaryFocused(true)}
          onBlurCapture={handleFocusChange(setIsPrimaryFocused)}
        >
          <div className="vrm-sidebar-header vrm-sidebar-header--brand">
            <div className="vrm-logo">
              <img
                src={companyLogoDataUri}
                alt="Company Logo"
                className="vrm-logo-img"
              />
            </div>
            <div className="vrm-brand-text">
              <div className="vrm-brand-title">VRM Portal</div>
              <div className="vrm-brand-subtitle">Energy insights</div>
            </div>
          </div>
          <NavList className="vrm-primary-nav">
            {primaryNavigationItems.map((item) => {
              const isActive = primaryActivePath === item.path;
              return (
                <NavRow
                  key={item.path}
                  to={getNavigationPath(item.path)}
                  leftIcon={item.icon}
                  label={item.label}
                  active={isActive}
                  ariaLabel={!isPrimaryExpanded ? item.label : undefined}
                  rightSlot={
                    item.path === "/sites" ? <IconChevronRight /> : undefined
                  }
                />
              );
            })}
            <NavRow
              leftIcon={<IconUpload />}
              label="Upload"
              className="vrm-nav-row--placeholder"
              ariaLabel={!isPrimaryExpanded ? "Upload" : undefined}
            />
            <NavRow
              leftIcon={<IconPin />}
              label="Keep menu expanded"
              onClick={handleKeepExpandedToggle}
              active={keepMenuExpanded}
              ariaLabel={!isPrimaryExpanded ? "Keep menu expanded" : undefined}
            />
            <NavRow
              leftIcon={<IconCollapse />}
              label={collapseLabel}
              onClick={handleCollapseSidebar}
              ariaLabel={!isPrimaryExpanded ? collapseLabel : undefined}
            />
          </NavList>
        </nav>
        {shouldShowSitesPanel && (
          <nav
            className="vrm-extended-panel"
            aria-label="Secondary"
            onMouseEnter={() => setIsSecondaryHovered(true)}
            onMouseLeave={() => setIsSecondaryHovered(false)}
            onFocusCapture={() => setIsSecondaryFocused(true)}
            onBlurCapture={handleFocusChange(setIsSecondaryFocused)}
          >
            <div className="vrm-secondary-header">
              <SecondarySearch />
              {!showSiteMenu && (
                <SecondaryPinnedRow
                  to={getNavigationPath(`/sites/${allSitesOption.id}/dashboard`)}
                  leftIcon={<IconSites />}
                  label={allSitesOption.label}
                  active={
                    isSiteSelection &&
                    allSitesOption.id === selectedSiteForList
                  }
                />
              )}
              {showSiteMenu && (
                <SecondaryPinnedRow
                  to={getNavigationPath("/sites")}
                  leftIcon={
                    <span className="vrm-nav-row__icon-stack">
                      <IconBackArrow />
                      <IconSites />
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
                  const isActive =
                    isSiteSelection && site.id === selectedSiteForList;
                  return (
                    <NavRow
                      key={site.id}
                      to={getNavigationPath(
                        `/sites/${site.id}/dashboard`,
                      )}
                      leftIcon={<IconSites />}
                      label={site.label}
                      active={isActive}
                      ariaLabel={!isSecondaryExpanded ? site.label : undefined}
                    />
                  );
                },
                )}
                <NavRow
                  leftIcon={<IconPlus />}
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
      {}{" "}
      <main className="vrm-main">
        {} <div className="vrm-content"> {children || <Outlet />} </div>
      </main>
    </div>
  );
};
export default VRMLayout;
