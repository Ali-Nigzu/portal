import React, { Suspense, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";

import VRMLayout from "../components/VRMLayout";
import { determineOrgId } from "../lib/org";
import { getStoredSiteId } from "../lib/sites";
import { getViewTokenFromLocation } from "../lib/viewToken";
import { Credentials } from "../types/credentials";

const DashboardPage = React.lazy(() => import("../pages/DashboardPage"));
const EventLogsPage = React.lazy(() => import("../pages/EventLogsPage"));
const AlarmLogsPage = React.lazy(() => import("../pages/AlarmLogsPage"));
const DeviceListPage = React.lazy(() => import("../pages/DeviceListPage"));
const ReportsPage = React.lazy(() => import("../pages/ReportsPage"));
const HomePage = React.lazy(() => import("../pages/HomePage"));
const SitesPage = React.lazy(() => import("../pages/SitesPage"));
const SettingsPage = React.lazy(() => import("../pages/SettingsPage"));
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
  const location = useLocation();
  const viewToken = getViewTokenFromLocation(location.search);
  const hasViewToken = Boolean(viewToken);
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
  const appendViewToken = (path: string) =>
    viewToken ? `${path}?view_token=${viewToken}` : path;
  const resolveLegacySiteId = () => getStoredSiteId() ?? "all";
  const SiteIndexRedirect: React.FC = () => {
    const { siteId } = useParams();
    const resolvedSiteId = siteId ?? resolveLegacySiteId();
    return (
      <Navigate
        to={appendViewToken(`/sites/${resolvedSiteId}/dashboard`)}
        replace
      />
    );
  };

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
              to={(() => {
                if (hasViewToken) {
                  return appendViewToken("/sites/all/dashboard");
                }
                return userRole === "admin"
                  ? appendViewToken("/admin")
                  : appendViewToken("/home");
              })()}
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
              to={(() => {
                if (hasViewToken) {
                  return appendViewToken("/sites/all/dashboard");
                }
                return userRole === "admin"
                  ? appendViewToken("/admin")
                  : appendViewToken("/home");
              })()}
              replace
            />
          )
        }
      />
      {shouldAllowAppRoutes && (
        <>
          <Route
            path="/home"
            element={renderClientRoute(
              lazyRoute(<HomePage />),
            )}
          />
          <Route
            path="/sites"
            element={renderClientRoute(
              lazyRoute(<SitesPage />),
            )}
          />
          <Route
            path="/settings"
            element={renderClientRoute(
              lazyRoute(<SettingsPage />),
            )}
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
              lazyRoute(<DashboardPage credentials={credentials} />),
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
          <Route
            path="/dashboard"
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
            path="/event-logs"
            element={
              <Navigate
                to={appendViewToken(
                  `/sites/${resolveLegacySiteId()}/event-logs`,
                )}
                replace
              />
            }
          />
          <Route
            path="/alarm-logs"
            element={
              <Navigate
                to={appendViewToken(
                  `/sites/${resolveLegacySiteId()}/alarm-logs`,
                )}
                replace
              />
            }
          />
          <Route
            path="/device-list"
            element={
              <Navigate
                to={appendViewToken(
                  `/sites/${resolveLegacySiteId()}/device-list`,
                )}
                replace
              />
            }
          />
          <Route
            path="/reports"
            element={
              <Navigate
                to={appendViewToken(
                  `/sites/${resolveLegacySiteId()}/reports`,
                )}
                replace
              />
            }
          />
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
              to={(() => {
                if (hasViewToken) {
                  return appendViewToken("/sites/all/dashboard");
                }
                return userRole === "admin"
                  ? appendViewToken("/admin")
                  : appendViewToken("/home");
              })()}
              replace
            />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
