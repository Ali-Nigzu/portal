import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import '../styles/VRMTheme.css';

interface VRMLayoutProps {
  userRole?: 'client' | 'admin';
  onLogout?: () => void;
  children?: React.ReactNode;
}

const VRMLayout: React.FC<VRMLayoutProps> = ({ userRole = 'client', onLogout, children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  const navigationItems = [
    {
      path: '/dashboard',
      label: 'Dashboard',
      icon: '📊',
      description: 'System Overview'
    },
    {
      path: '/event-logs',
      label: 'Event logs',
      icon: '📝',
      description: 'Activity Events'
    },
    {
      path: '/alarm-logs', 
      label: 'Alarm logs',
      icon: '⚠️',
      description: 'System Alerts'
    },
    {
      path: '/device-list',
      label: 'Device list',
      icon: '📷',
      description: 'Data Sources'
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: '📈',
      description: 'Analytics Reports'
    }
  ];

  // Add admin section for admin users
  if (userRole === 'admin') {
    navigationItems.push({
      path: '/admin',
      label: 'Admin',
      icon: '⚙️',
      description: 'User Management'
    });
  }

  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="vrm-layout">
      {/* Sidebar Navigation */}
      <nav className={`vrm-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Sidebar Header */}
        <div className="vrm-sidebar-header">
          <div className="vrm-logo">N</div>
          <div className="vrm-logo-text">Nigzsu</div>
        </div>

        {/* Navigation Menu */}
        <div className="vrm-nav">
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`vrm-nav-item ${isActiveRoute(item.path) ? 'active' : ''}`}
              title={sidebarCollapsed ? item.description : ''}
            >
              <div className="vrm-nav-icon">{item.icon}</div>
              <div className="vrm-nav-text">{item.label}</div>
            </Link>
          ))}
        </div>

        {/* Collapse Toggle */}
        <button
          className="vrm-collapse-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ position: 'relative', margin: '16px auto' }}
        >
          {sidebarCollapsed ? '→' : '←'}
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="vrm-main">
        {/* Top Header */}
        <header className="vrm-header">
          <div className="vrm-header-left">
            {/* Search Bar */}
            <div className="vrm-search">
              <div className="vrm-search-icon">🔍</div>
              <input 
                type="text" 
                placeholder="Search..." 
                aria-label="Search"
              />
            </div>
          </div>

          <div className="vrm-header-right">
            {/* User Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

        {/* Page Content */}
        <div className="vrm-content">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
};

export default VRMLayout;