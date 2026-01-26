import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import VRMLayout from '../components/VRMLayout';
import AnalyticsComingSoonPage from '../pages/AnalyticsComingSoonPage';
import AlarmLogsPage from '../pages/AlarmLogsPage';
import DashboardPage from '../pages/DashboardPage';
import DeviceListPage from '../pages/DeviceListPage';
import EventLogsPage from '../pages/EventLogsPage';
import LandingPage from '../pages/LandingPage';
import LoginPage from '../pages/LoginPage';
import ReportsPage from '../pages/ReportsPage';
import AdminPage from '../pages/AdminPage';
import { Credentials } from '../types/credentials';
import { determineOrgId } from '../lib/org';
import { getViewTokenFromLocation } from '../lib/viewToken';

const AppRoutes: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' });
  const [userRole, setUserRole] = useState<'client' | 'admin'>('client');
  const hasViewToken = Boolean(getViewTokenFromLocation());
  const [isSessionChecked, setIsSessionChecked] = useState(hasViewToken);

  useEffect(() => {
    if (hasViewToken) {
      setIsSessionChecked(true);
      return;
    }
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
    setIsSessionChecked(true);
  }, [hasViewToken]);

  const handleLogin = (nextCreds: Credentials) => {
    const resolvedOrgId = nextCreds.orgId ?? determineOrgId({ username: nextCreds.username });
    setCredentials({ ...nextCreds, orgId: resolvedOrgId });
    setUserRole(nextCreds.username === 'admin' ? 'admin' : 'client');
    setIsLoggedIn(true);
    sessionStorage.setItem(
      'camOS_credentials',
      JSON.stringify({ ...nextCreds, orgId: resolvedOrgId }),
    );
  };

  const handleLogout = () => {
    sessionStorage.removeItem('camOS_credentials');
    const hasViewToken = Boolean(getViewTokenFromLocation());
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

  const resolvedRole = hasViewToken ? 'client' : userRole;
  const shouldAllowAppRoutes = isLoggedIn || hasViewToken;

  if (!isSessionChecked) {
    return null;
  }

  const renderClientRoute = (element: React.ReactNode) => (
    <VRMLayout userRole={resolvedRole} onLogout={handleLogout}>
      {userRole === 'admin' && !hasViewToken ? <Navigate to="/admin" replace /> : element}
    </VRMLayout>
  );

  const analyticsElement = (
    <VRMLayout userRole={resolvedRole} onLogout={handleLogout}>
      <AnalyticsComingSoonPage />
    </VRMLayout>
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          !isLoggedIn && !hasViewToken ? (
            <LandingPage />
          ) : (
            <Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />
          )
        }
      />
      <Route
        path="/login"
        element={
          !isLoggedIn && !hasViewToken ? (
            <LoginPage onLogin={handleLogin} />
          ) : (
            <Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />
          )
        }
      />
      {shouldAllowAppRoutes && (
        <>
          <Route
            path="/dashboard"
            element={renderClientRoute(<DashboardPage credentials={credentials} />)}
          />
          <Route path="/event-logs" element={renderClientRoute(<EventLogsPage credentials={credentials} />)} />
          <Route path="/alarm-logs" element={renderClientRoute(<AlarmLogsPage credentials={credentials} />)} />
          <Route path="/device-list" element={renderClientRoute(<DeviceListPage credentials={credentials} />)} />
          <Route path="/reports" element={renderClientRoute(<ReportsPage credentials={credentials} />)} />
          <Route path="/analytics" element={analyticsElement} />
          <Route path="/analytics/v2" element={analyticsElement} />
          <Route path="/analytics/legacy" element={analyticsElement} />
          <Route path="/analytics/*" element={analyticsElement} />
          {userRole === 'admin' && (
            <Route
              path="/admin"
              element={
                <VRMLayout userRole={resolvedRole} onLogout={handleLogout}>
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
            <Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
