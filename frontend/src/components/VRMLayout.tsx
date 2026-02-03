import React, { useEffect, useMemo } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import "../styles/VRMTheme.css";
import { companyLogoDataUri } from "../assets/companyLogo";
import {
  SITE_OPTIONS,
  findSiteById,
  getStoredSiteId,
  setStoredSiteId,
} from "../lib/sites";
import { getViewTokenFromLocation } from "../lib/viewToken";
interface VRMLayoutProps {
  userRole?: "client" | "admin";
  onLogout?: () => void;
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
const VRMLayout: React.FC<VRMLayoutProps> = ({
  userRole = "client",
  onLogout,
  children,
}) => {
  const location = useLocation();
  const { siteId } = useParams();
  const viewToken = getViewTokenFromLocation(location.search);
  const activeSite = findSiteById(siteId);
  const getNavigationPath = (path: string) => {
    return viewToken ? `${path}?view_token=${viewToken}` : path;
  };
  useEffect(() => {
    if (siteId) {
      setStoredSiteId(siteId);
    }
  }, [siteId]);
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
  return (
    <div className="vrm-layout">
      {" "}
      {}{" "}
      <div
        className={`vrm-sidebar-shell ${
          shouldShowSitesPanel ? "vrm-sidebar-shell--sites" : ""
        }`}
        aria-label="Primary"
      >
        <nav className="vrm-primary-rail">
          <div className="vrm-sidebar-header vrm-sidebar-header--compact">
            <div className="vrm-logo">
              <img
                src={companyLogoDataUri}
                alt="Company Logo"
                className="vrm-logo-img"
              />
            </div>
          </div>
          <div className="vrm-nav vrm-nav--rail">
            {primaryNavigationItems.map((item) => {
              const isActive = primaryActivePath === item.path;
              return (
                <Link
                  key={item.path}
                  to={getNavigationPath(item.path)}
                  className={`vrm-nav-item vrm-nav-row ${
                    isActive ? "active" : ""
                  }`}
                >
                  {item.icon}
                  <span className="vrm-nav-text">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        {shouldShowSitesPanel && (
          <nav className="vrm-extended-panel" aria-label="Secondary">
            <div className="vrm-extended-header">
              {showSiteMenu ? (
                <Link
                  to={getNavigationPath("/sites")}
                  className="vrm-extended-back"
                >
                  ← Back to Sites
                </Link>
              ) : null}
              <div className="vrm-extended-title">
                {showSiteMenu ? activeSite?.label ?? "Site" : "Sites"}
              </div>
            </div>
            {!showSiteMenu && (
              <div className="vrm-nav">
                {SITE_OPTIONS.map((site) => {
                  const isActive =
                    isSiteSelection && site.id === selectedSiteForList;
                  return (
                    <Link
                      key={site.id}
                      to={getNavigationPath(
                        `/sites/${site.id}/dashboard`,
                      )}
                      className={`vrm-nav-item vrm-nav-row ${
                        isActive ? "active" : ""
                      }`}
                    >
                      <IconSites />
                      <div className="vrm-nav-text">{site.label}</div>
                    </Link>
                  );
                })}
              </div>
            )}
            {showSiteMenu && !shouldShowAdminMenu && (
              <div className="vrm-nav">
                {clientNavigationItems.map((item) => {
                  const isDisabled = Boolean(item.disabled);
                  const isActive =
                    item.path && !isDisabled ? isActiveRoute(item.path) : false;
                  const navText = (
                    <div className="vrm-nav-text">
                      {item.label}
                      {item.statusLabel && (
                        <span className="vrm-nav-badge">
                          {item.statusLabel}
                        </span>
                      )}
                    </div>
                  );
                  if (isDisabled) {
                    return (
                      <div
                        key={item.id ?? item.label}
                        className="vrm-nav-item vrm-nav-row vrm-nav-item--disabled"
                        aria-disabled="true"
                      >
                        {item.icon}
                        {navText}
                      </div>
                    );
                  }
                  if (!item.path) {
                    return null;
                  }
                  return (
                    <Link
                      key={item.path}
                      to={getNavigationPath(item.path)}
                      className={`vrm-nav-item vrm-nav-row ${
                        isActive ? "active" : ""
                      }`}
                    >
                      {item.icon}
                      {navText}
                    </Link>
                  );
                })}
              </div>
            )}
            {shouldShowAdminMenu && (
              <div className="vrm-nav">
                {adminNavigationItems.map((item) => (
                  <Link
                    key={item.path}
                    to={getNavigationPath(item.path)}
                    className={`vrm-nav-item vrm-nav-row ${
                      item.path && isActiveRoute(item.path) ? "active" : ""
                    }`}
                  >
                    {item.icon}
                    <div className="vrm-nav-text">{item.label}</div>
                  </Link>
                ))}
              </div>
            )}
          </nav>
        )}
      </div>
      {}{" "}
      <main className="vrm-main">
        <div className="vrm-header-stack">
          <header className="vrm-header vrm-header--userbar">
            <div className="vrm-header-right">
              {" "}
              {}{" "}
              <div className="vrm-user-meta">
                <span className="vrm-status vrm-status-online">
                  <div className="vrm-status-dot"></div>{" "}
                  {userRole === "admin" ? "Administrator" : "Client"}{" "}
                </span>{" "}
                {onLogout && (
                  <button
                    className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                    onClick={onLogout}
                    title="Logout"
                  >
                    {" "}
                    Logout{" "}
                  </button>
                )}{" "}
              </div>
            </div>
          </header>
        </div>{" "}
        {} <div className="vrm-content"> {children || <Outlet />} </div>
      </main>
    </div>
  );
};
export default VRMLayout;
