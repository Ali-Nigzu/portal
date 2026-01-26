import React, { Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import VRMLayout from "../components/VRMLayout";
import { determineOrgId } from "../lib/org";
import { getViewTokenFromLocation } from "../lib/viewToken";
import { Credentials } from "../types/credentials";

const DashboardPage = React.lazy(() => import("../pages/DashboardPage"));
const EventLogsPage = React.lazy(() => import("../pages/EventLogsPage"));
const AlarmLogsPage = React.lazy(() => import("../pages/AlarmLogsPage"));
const DeviceListPage = React.lazy(() => import("../pages/DeviceListPage"));
const AnalyticsComingSoonPage = React.lazy(
  () => import("../pages/AnalyticsComingSoonPage"),
);
const ReportsPage = React.lazy(() => import("../pages/ReportsPage"));
const AdminPage = React.lazy(() => import("../pages/AdminPage"));
const LandingPage = React.lazy(() => import("../pages/LandingPage"));
const LoginPage = React.lazy(() => import("../pages/LoginPage"));

const AppRoutes: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>({
    username: "",
    password: "",
  });
  const [userRole, setUserRole] = useState<"client" | "admin">("client");
  const hasViewToken = Boolean(getViewTokenFromLocation());
  const [isSessionChecked, setIsSessionChecked] = useState(hasViewToken);

  useEffect(() => {
    if (hasViewToken) {
      setIsSessionChecked(true);
      return;
    }
    const savedCredentials = sessionStorage.getItem("camOS_credentials");
    if (savedCredentials) {
      try {
        const { username, password, orgId } = JSON.parse(savedCredentials);
        const resolvedOrgId = orgId ?? determineOrgId({ username });
        setCredentials({ username, password, orgId: resolvedOrgId });
        setUserRole(username === "admin" ? "admin" : "client");
        setIsLoggedIn(true);
      } catch (error) {
        console.error("Failed to restore session:", error);
        sessionStorage.removeItem("camOS_credentials");
      }
    }
    setIsSessionChecked(true);
  }, [hasViewToken]);

  const handleLogin = (nextCreds: Credentials) => {
    const resolvedOrgId =
      nextCreds.orgId ?? determineOrgId({ username: nextCreds.username });
    setCredentials({ ...nextCreds, orgId: resolvedOrgId });
    setUserRole(nextCreds.username === "admin" ? "admin" : "client");
    setIsLoggedIn(true);
    sessionStorage.setItem(
      "camOS_credentials",
      JSON.stringify({ ...nextCreds, orgId: resolvedOrgId }),
    );
  };

  const handleLogout = () => {
    sessionStorage.removeItem("camOS_credentials");
    const nextHasViewToken = Boolean(getViewTokenFromLocation());
    if (nextHasViewToken) {
      window.close();
      setTimeout(() => {
        window.location.href = "/";
      }, 100);
    } else {
      setIsLoggedIn(false);
      setCredentials({ username: "", password: "", orgId: undefined });
      setUserRole("client");
    }
  };

  const resolvedRole = hasViewToken ? "client" : userRole;
  const shouldAllowAppRoutes = isLoggedIn || hasViewToken;

  if (!isSessionChecked) {
    return null;
  }

  const renderClientRoute = (element: React.ReactNode) => (
    <VRMLayout userRole={resolvedRole} onLogout={handleLogout}>
      {userRole === "admin" && !hasViewToken ? (
        <Navigate to="/admin" replace />
      ) : (
        element
      )}
    </VRMLayout>
  );

  const analyticsElement = (
    <VRMLayout userRole={resolvedRole} onLogout={handleLogout}>
      <Suspense fallback={null}>
        <AnalyticsComingSoonPage />
      </Suspense>
    </VRMLayout>
  );

  const lazyRoute = (element: React.ReactNode) => (
    <Suspense fallback={null}>{element}</Suspense>
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          !isLoggedIn && !hasViewToken ? (
            lazyRoute(<LandingPage />)
          ) : (
            <Navigate
              to={userRole === "admin" ? "/admin" : "/dashboard"}
              replace
            />
          )
        }
      />
      <Route
        path="/login"
        element={
          !isLoggedIn && !hasViewToken ? (
            lazyRoute(<LoginPage onLogin={handleLogin} />)
          ) : (
            <Navigate
              to={userRole === "admin" ? "/admin" : "/dashboard"}
              replace
            />
          )
        }
      />
      {shouldAllowAppRoutes && (
        <>
          <Route
            path="/dashboard"
            element={renderClientRoute(
              lazyRoute(<DashboardPage credentials={credentials} />),
            )}
          />
          <Route
            path="/event-logs"
            element={renderClientRoute(
              lazyRoute(<EventLogsPage credentials={credentials} />),
            )}
          />
          <Route
            path="/alarm-logs"
            element={renderClientRoute(
              lazyRoute(<AlarmLogsPage credentials={credentials} />),
            )}
          />
          <Route
            path="/device-list"
            element={renderClientRoute(
              lazyRoute(<DeviceListPage credentials={credentials} />),
            )}
          />
          <Route
            path="/reports"
            element={renderClientRoute(
              lazyRoute(<ReportsPage credentials={credentials} />),
            )}
          />
          <Route path="/analytics" element={analyticsElement} />
          {userRole === "admin" && (
            <Route
              path="/admin"
              element={
                <VRMLayout userRole={resolvedRole} onLogout={handleLogout}>
                  {lazyRoute(<AdminPage credentials={credentials} />)}
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
            <Navigate
              to={userRole === "admin" ? "/admin" : "/dashboard"}
              replace
            />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
