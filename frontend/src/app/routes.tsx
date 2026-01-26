import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import VRMLayout from '../components/VRMLayout';
import { GlobalControlsProvider } from '../context/GlobalControlsContext';
import DashboardPage from '../pages/DashboardPage';
import EventLogsPage from '../pages/EventLogsPage';
import AlarmLogsPage from '../pages/AlarmLogsPage';
import DeviceListPage from '../pages/DeviceListPage';
import ReportsPage from '../pages/ReportsPage';
import AnalyticsComingSoonPage from '../pages/AnalyticsComingSoonPage';
import AdminPage from '../pages/AdminPage';
import LandingPage from '../pages/LandingPage';
import LoginPage from '../pages/LoginPage';
import { Credentials } from '../types/credentials';
import { determineOrgId } from '../lib/org';

const AppRoutes: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' });
  const [userRole, setUserRole] = useState<'client' | 'admin'>('client');

  useEffect(() => {
    const savedCredentials = sessionStorage.getItem('camOS_credentials');
    if (savedCredentials) {
      try {
        const { username, password, orgId } = JSON.parse(savedCredentials);
        const resolvedOrgId = orgId ?? determineOrgId({ username });
        setCredentials({ username, password, orgId: resolvedOrgId });
        setUserRole(username === 'admin' ? 'admin' : 'client');
        setIsLoggedIn(true);
      } catch (error) {
        console.error('Failed to restore session:', error);
        sessionStorage.removeItem('camOS_credentials');
      }
    }
  }, []);

  const handleLogin = (nextCreds: Credentials) => {
    const resolvedOrgId = nextCreds.orgId ?? determineOrgId({ username: nextCreds.username });
    setCredentials({ ...nextCreds, orgId: resolvedOrgId });
    setUserRole(nextCreds.username === 'admin' ? 'admin' : 'client');
    setIsLoggedIn(true);
    sessionStorage.setItem('camOS_credentials', JSON.stringify({ ...nextCreds, orgId: resolvedOrgId }));
  };

  const handleLogout = () => {
    sessionStorage.removeItem('camOS_credentials');
    const hasViewToken = new URLSearchParams(window.location.search).has('view_token');

    if (hasViewToken) {
      window.close();
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    } else {
      setIsLoggedIn(false);
      setCredentials({ username: '', password: '', orgId: undefined });
      setUserRole('client');
    }
  };

  const hasViewToken = new URLSearchParams(window.location.search).has('view_token');
  const redirectTarget = userRole === 'admin' ? '/admin' : '/dashboard';
  const layoutRole = hasViewToken ? 'client' : userRole;

  const renderClientRoute = (content: React.ReactNode) => (
    <VRMLayout userRole={layoutRole} onLogout={handleLogout}>
      {userRole === 'admin' && !hasViewToken ? <Navigate to="/admin" replace /> : content}
    </VRMLayout>
  );

  const analyticsElement = (
    <VRMLayout userRole={layoutRole} onLogout={handleLogout}>
      <AnalyticsComingSoonPage />
    </VRMLayout>
  );

  return (
    <GlobalControlsProvider>
      <Routes>
        <Route
          path="/"
          element={!isLoggedIn && !hasViewToken ? <LandingPage /> : <Navigate to={redirectTarget} replace />}
        />
        <Route
          path="/login"
          element={
            !isLoggedIn && !hasViewToken ? (
              <LoginPage onLogin={handleLogin} />
            ) : (
              <Navigate to={redirectTarget} replace />
            )
          }
        />
        {(isLoggedIn || hasViewToken) && (
          <>
            <Route
              path="/dashboard"
              element={renderClientRoute(<DashboardPage credentials={credentials} />)}
            />
            <Route
              path="/event-logs"
              element={renderClientRoute(<EventLogsPage credentials={credentials} />)}
            />
            <Route
              path="/alarm-logs"
              element={renderClientRoute(<AlarmLogsPage credentials={credentials} />)}
            />
            <Route
              path="/device-list"
              element={renderClientRoute(<DeviceListPage credentials={credentials} />)}
            />
            <Route path="/analytics" element={analyticsElement} />
            <Route path="/analytics/v2" element={analyticsElement} />
            <Route path="/analytics/legacy" element={analyticsElement} />
            <Route path="/analytics/*" element={analyticsElement} />
            <Route
              path="/reports"
              element={renderClientRoute(<ReportsPage credentials={credentials} />)}
            />
            {userRole === 'admin' && (
              <Route
                path="/admin"
                element={
                  <VRMLayout userRole={userRole} onLogout={handleLogout}>
                    <AdminPage credentials={credentials} />
                  </VRMLayout>
                }
              />
            )}
          </>
        )}
        <Route
          path="*"
          element={
            !isLoggedIn && !hasViewToken ? (
              <Navigate to="/" replace />
            ) : (
              <Navigate to={redirectTarget} replace />
            )
          }
        />
      </Routes>
    </GlobalControlsProvider>
  );
};

export default AppRoutes;
