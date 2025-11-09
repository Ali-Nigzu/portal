import React, { useMemo, useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import HeaderStatusStrip from './HeaderStatusStrip';
import '../styles/VRMTheme.css';

interface VRMLayoutProps {
  userRole?: 'client' | 'admin';
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
  <svg className="vrm-nav-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
    <path
      d="M5 19h2v-6H5v6Zm6 0h2V5h-2v14Zm6 0h2v-9h-2v9ZM4 21h16a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

const IconEventLogs = () => (
  <svg className="vrm-nav-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
    <path
      d="M5 4h4l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm0 5v10h14V9H5Zm9 3h3v2h-3v-2Zm-8 0h6v2H6v-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

const IconAlarm = () => (
  <svg className="vrm-nav-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
    <path
      d="M12 3a7 7 0 0 0-7 7v3.764l-1.447 2.894A1 1 0 0 0 4.447 18H19.55a1 1 0 0 0 .894-1.447L19 13.764V10a7 7 0 0 0-7-7Zm0 18a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

const IconDevice = () => (
  <svg className="vrm-nav-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
    <path
      d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Zm2 0v12h10V6H7Zm2 13h6v2H9v-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

const IconReports = () => (
  <svg className="vrm-nav-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
    <path
      d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm8 0v4h4l-4-4ZM8 12h8v2H8v-2Zm0 4h5v2H8v-2Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

const IconAdmin = () => (
  <svg className="vrm-nav-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
    <path
      d="M12 2a5 5 0 0 1 5 5v1.268a3 3 0 0 1 2 2.829V14a3 3 0 0 1-2 2.829V18a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-1.171A3 3 0 0 1 5 14v-2.903a3 3 0 0 1 2-2.83V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v1h6V7a3 3 0 0 0-3-3Zm-1 15h2a1 1 0 0 0 1-1v-1h-4v1a1 1 0 0 0 1 1Zm-4-5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.903a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1V14Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

const VRMLayout: React.FC<VRMLayoutProps> = ({ userRole = 'client', onLogout, children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  const viewToken = new URLSearchParams(location.search).get('view_token');
  const getNavigationPath = (path: string) => {
    return viewToken ? `${path}?view_token=${viewToken}` : path;
  };

  const clientNavigationItems = useMemo(
    () => [
      {
        path: '/dashboard',
        label: 'Dashboard',
        icon: <IconDashboard />,
        description: 'System overview',
      },
      {
        path: '/analytics',
        label: 'Analytics',
        icon: <IconAnalytics />,
        description: 'Advanced analytics',
      },
      {
        path: '/event-logs',
        label: 'Event logs',
        icon: <IconEventLogs />,
        description: 'Activity events',
      },
      {
        path: '/alarm-logs',
        label: 'Alarm logs',
        icon: <IconAlarm />,
        description: 'System alerts',
      },
      {
        path: '/device-list',
        label: 'Device list',
        icon: <IconDevice />,
        description: 'Data sources',
      },
      {
        path: '/reports',
        label: 'Reports',
        icon: <IconReports />,
        description: 'Analytics reports',
      },
    ],
    []
  );

  const adminNavigationItems = useMemo(
    () => [
      {
        path: '/admin',
        label: 'Admin',
        icon: <IconAdmin />,
        description: 'Admin panel',
      },
    ],
    []
  );

  // Show only admin navigation for admin users, client navigation for clients
  const navigationItems = userRole === 'admin' ? adminNavigationItems : clientNavigationItems;

  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="vrm-layout">
      {/* Sidebar Navigation */}
      <nav className={`vrm-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="Primary">
        {/* Sidebar Header */}
        <div className="vrm-sidebar-header">
          <div className="vrm-logo">
            <img
              src="/company-logo.png"
              alt="Company Logo"
              className="vrm-logo-img"
            />
          </div>
          <div className="vrm-logo-text">camOS</div>
        </div>

        {/* Collapse Toggle */}
        <button
          className="vrm-collapse-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            {sidebarCollapsed ? (
              <path d="M3 10h14M3 5h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            ) : (
              <path d="M6 10h8M6 5h8M6 15h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            )}
          </svg>
        </button>

        {/* Navigation Menu */}
        <div className="vrm-nav">
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              to={getNavigationPath(item.path)}
              className={`vrm-nav-item ${isActiveRoute(item.path) ? 'active' : ''}`}
              title={sidebarCollapsed ? item.description : ''}
            >
              {item.icon}
              <div className="vrm-nav-text">{item.label}</div>
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="vrm-main">
        <div className="vrm-header-stack">
          <header className="vrm-header">
            <div className="vrm-header-left">
              {/* Search Bar */}
              <div className="vrm-search">
                <div className="vrm-search-icon" aria-hidden="true"></div>
                <input
                  type="text"
                  placeholder="Search or type /"
                  aria-label="Search"
                />
              </div>
              <div className="vrm-site-context" role="tablist" aria-label="Sites">
                <button type="button" className="vrm-site-chip active" role="tab" aria-selected="true">
                  Site 0
                </button>
                <button type="button" className="vrm-site-chip disabled" aria-disabled role="tab">
                  Add site
                </button>
              </div>
            </div>

            <div className="vrm-header-right">
              {/* User Info */}
              <div className="vrm-user-meta">
                <span className="vrm-status vrm-status-online">
                  <div className="vrm-status-dot"></div>
                  {userRole === 'admin' ? 'Administrator' : 'Client'}
                </span>
                {onLogout && (
                  <button
                    className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                    onClick={onLogout}
                    title="Logout"
                  >
                    Logout
                  </button>
                )}
              </div>
            </div>
          </header>

          <HeaderStatusStrip />
        </div>

        {/* Page Content */}
        <div className="vrm-content">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
};

export default VRMLayout;