import React, { Suspense, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";

import VRMLayout from "../components/VRMLayout";
import { clearDemoSessionLocal, isDemoSessionActive } from "../lib/demoSession";
import { getDefaultSiteId, getStoredSiteId } from "../lib/sites";
import { getViewTokenFromLocation } from "../lib/viewToken";
import { fetchMe } from "../features/auth/transport/me";
import { Credentials } from "../types/credentials";
import { loadEmptyWidgetResult } from "../features/dashboard/transport/loadEmptyWidgetResult";
import type { DashboardDataMode } from "../features/dashboard/transport/loadWidgetResult";

const DashboardPage = React.lazy(() => import("../pages/DashboardPage"));
const EventLogsPage = React.lazy(() => import("../pages/EventLogsPage"));
const AlarmLogsPage = React.lazy(() => import("../pages/AlarmLogsPage"));
const DeviceListPage = React.lazy(() => import("../pages/DeviceListPage"));
const ReportsPage = React.lazy(() => import("../pages/ReportsPage"));
const AdminPage = React.lazy(() => import("../pages/AdminPage"));
const HomePage = React.lazy(() => import("../pages/HomePage"));
const LandingPage = React.lazy(() => import("../pages/LandingPage"));
const LoginPage = React.lazy(() => import("../pages/LoginPage"));
const CreateAccountPage = React.lazy(() => import("../pages/CreateAccountPage"));
const DemoPage = React.lazy(() => import("../pages/DemoPage"));

const AppRoutes: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>({
    username: "",
    password: "",
  });
  const [userRole, setUserRole] = useState<"client" | "admin">("client");
  const location = useLocation();
  const viewToken = getViewTokenFromLocation(location.search);
  const hasViewToken = Boolean(viewToken);
  const [isSessionChecked, setIsSessionChecked] = useState(hasViewToken);

  useEffect(() => {
    if (hasViewToken) {
      setIsSessionChecked(true);
      return;
    }

    const checkSession = async () => {
      try {
        const me = await fetchMe();
        setIsLoggedIn(me.ok);
      } catch {
        setIsLoggedIn(false);
      } finally {
        setIsSessionChecked(true);
      }
    };

    checkSession();
  }, [hasViewToken]);

  const handleLogin = () => {
    clearDemoSessionLocal();
    setIsLoggedIn(true);
    setCredentials({ username: "", password: "" });
    setUserRole("client");
  };

  const handleLogout = () => {
    clearDemoSessionLocal();
    setIsLoggedIn(false);
    setCredentials({ username: "", password: "" });
    setUserRole("client");
  };

  const isDemoSession = isDemoSessionActive();
  const appMode: "public" | "authenticated" | "view_token" | "demo" = isLoggedIn
    ? "authenticated"
    : hasViewToken
      ? "view_token"
      : isDemoSession
        ? "demo"
        : "public";
  const isAuthenticatedMode = appMode === "authenticated";
  const dashboardDataMode: DashboardDataMode = appMode === "authenticated"
    ? "authenticated"
    : appMode === "demo"
      ? "demo"
      : "view_token";
  const resolvedRole = appMode === "view_token" ? "client" : userRole;
  const shouldAllowAppRoutes = appMode !== "public";
  const appendParams = (
    path: string,
    params?: Record<string, string | undefined>,
  ) => {
    const searchParams = new URLSearchParams(location.search);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined) {
          searchParams.delete(key);
        } else {
          searchParams.set(key, value);
        }
      });
    }
    const query = searchParams.toString();
    return query ? `${path}?${query}` : path;
  };
  const appendViewToken = (path: string) =>
    viewToken ? appendParams(path, { view_token: viewToken }) : path;
  const resolveLegacySiteId = () => {
    const stored = getStoredSiteId();
    if (!stored || stored === "all") {
      return getDefaultSiteId();
    }
    return stored;
  };
  const SiteIndexRedirect: React.FC = () => {
    const { siteId } = useParams();
    const resolvedSiteId = siteId ?? resolveLegacySiteId();
    return (
      <Navigate
        to={appendParams(`/sites/${resolvedSiteId}/dashboard`)}
        replace
      />
    );
  };
  const SitesSelectorRedirect: React.FC = () => {
    const resolvedSiteId = resolveLegacySiteId();
    return (
      <Navigate
        to={appendParams(`/sites/${resolvedSiteId}/dashboard`, {
          panel: "sites",
        })}
        replace
      />
    );
  };

  if (!isSessionChecked) {
    return null;
  }

  const renderClientRoute = (element: React.ReactNode) => (
    <VRMLayout userRole={resolvedRole} isAuthenticated={isAuthenticatedMode} onLogout={handleLogout}>
      {userRole === "admin" && !hasViewToken ? (
        <Navigate to="/admin" replace />
      ) : (
        element
      )}
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
          appMode === "public" ? (
            lazyRoute(<LandingPage />)
          ) : appMode === "view_token" || appMode === "demo" ? (
            <Navigate to={appendViewToken("/sites/all/dashboard")} replace />
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route path="/demo" element={lazyRoute(<DemoPage />)} />
      <Route
        path="/create-account"
        element={
          appMode === "public" ? (
            lazyRoute(<CreateAccountPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/login"
        element={
          appMode === "public" ? (
            lazyRoute(<LoginPage onLogin={handleLogin} />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          shouldAllowAppRoutes ? (
            <Navigate to={appendViewToken(`/sites/${resolveLegacySiteId()}/dashboard`)} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      {shouldAllowAppRoutes && (
        <>
          <Route
            path="/sites"
            element={<SitesSelectorRedirect />}
          />
          <Route
            path="/home"
            element={
              isAuthenticatedMode ? (
                renderClientRoute(lazyRoute(<HomePage />))
              ) : (
                <Navigate
                  to={appendViewToken(
                    `/sites/${resolveLegacySiteId()}/dashboard`,
                  )}
                  replace
                />
              )
            }
          />
          <Route
            path="/settings"
            element={
              <Navigate
                to={appendViewToken(
                  `/sites/${resolveLegacySiteId()}/dashboard`,
                )}
                replace
              />
            }
          />
          <Route
            path="/sites/:siteId"
            element={renderClientRoute(
              <SiteIndexRedirect />,
            )}
          />
          <Route
            path="/sites/:siteId/dashboard"
            element={renderClientRoute(
              lazyRoute(
                <DashboardPage
                  credentials={credentials}
                  dataMode={dashboardDataMode}
                  widgetResultLoader={
                    isAuthenticatedMode ? loadEmptyWidgetResult : undefined
                  }
                />,
              ),
            )}
          />
          <Route
            path="/sites/:siteId/event-logs"
            element={renderClientRoute(
              lazyRoute(<EventLogsPage credentials={credentials} />),
            )}
          />
          <Route
            path="/sites/:siteId/alarm-logs"
            element={renderClientRoute(
              lazyRoute(<AlarmLogsPage credentials={credentials} />),
            )}
          />
          <Route
            path="/sites/:siteId/device-list"
            element={renderClientRoute(
              lazyRoute(<DeviceListPage credentials={credentials} />),
            )}
          />
          <Route
            path="/sites/:siteId/reports"
            element={renderClientRoute(
              lazyRoute(<ReportsPage credentials={credentials} />),
            )}
          />
          {userRole === "admin" && (
            <Route
              path="/admin"
              element={
                <VRMLayout userRole={resolvedRole} isAuthenticated={isAuthenticatedMode} onLogout={handleLogout}>
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
          appMode === "public" ? (
            <Navigate to="/" replace />
          ) : appMode === "view_token" || appMode === "demo" ? (
            <Navigate to={appendViewToken("/sites/all/dashboard")} replace />
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
