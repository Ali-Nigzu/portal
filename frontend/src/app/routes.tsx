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
import { getDefaultSiteId, getStoredSiteId } from "../lib/sites";
import { getViewTokenFromLocation } from "../lib/viewToken";
import { Credentials } from "../types/credentials";

const DashboardPage = React.lazy(() => import("../pages/DashboardPage"));
const EventLogsPage = React.lazy(() => import("../pages/EventLogsPage"));
const AlarmLogsPage = React.lazy(() => import("../pages/AlarmLogsPage"));
const DeviceListPage = React.lazy(() => import("../pages/DeviceListPage"));
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

  const resolvedRole = hasViewToken ? "client" : userRole;
  const shouldAllowAppRoutes = isLoggedIn || hasViewToken;
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
    <VRMLayout userRole={resolvedRole}>
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
                return appendViewToken(
                  `/sites/${getDefaultSiteId()}/dashboard`,
                );
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
                return appendViewToken(
                  `/sites/${getDefaultSiteId()}/dashboard`,
                );
              })()}
              replace
            />
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
              <Navigate
                to={appendViewToken(
                  `/sites/${resolveLegacySiteId()}/dashboard`,
                )}
                replace
              />
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
                <VRMLayout userRole={resolvedRole}>
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
                return appendViewToken(
                  `/sites/${getDefaultSiteId()}/dashboard`,
                );
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
