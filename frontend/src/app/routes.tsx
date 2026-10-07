import React, { Suspense, useEffect, useState, useCallback, useRef } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";

import VRMLayout from "../components/VRMLayout";
import {
  clearDemoSessionLocal,
  isDemoSessionActive,
} from "../lib/demoSession";
import { getDefaultSiteId, getStoredSiteId } from "../lib/sites";
import { getViewTokenFromLocation } from "../lib/viewToken";
import { fetchMe } from "../features/auth/transport/me";
import type { AuthUser } from "../features/auth/transport/me";
import { fetchOrganisations, type AuthenticatedOrganisation } from "../features/auth/transport/organisations";
import { AuthenticatedApplicationProvider } from "../context/AuthenticatedApplicationContext";
import AuthenticatedAppShell from "../components/AuthenticatedAppShell";
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
const DocumentsPage = React.lazy(() => import("../pages/DocumentsPage"));
const MyAccountPage = React.lazy(() => import("../features/settings/pages/MyAccountPage"));
const ManageAccessPage = React.lazy(() => import("../features/settings/pages/ManageAccessPage"));
const LandingPage = React.lazy(() => import("../pages/LandingPage"));
const LoginPage = React.lazy(() => import("../pages/LoginPage"));
const CreateAccountPage = React.lazy(() => import("../pages/CreateAccountPage"));
const VerifyEmailPage = React.lazy(() => import("../pages/VerifyEmailPage"));
const ResetPasswordPage = React.lazy(() => import("../pages/ResetPasswordPage"));
const ContactPage = React.lazy(() => import("../pages/ContactPage"));
const DemoDashboardRoute = React.lazy(() => import("../features/organisation-dashboard/DemoDashboardRoute"));
const DemoPage = React.lazy(() => import("../pages/DemoPage"));
const AuthenticatedOrganisationPortalRoute = React.lazy(() => import("../features/organisation-dashboard/AuthenticatedOrganisationPortalRoute"));
const TermsAndConditionsPage = React.lazy(() => import("../pages/TermsAndConditionsPage"));
const PrivacyPolicyPage = React.lazy(() => import("../pages/PrivacyPolicyPage"));
const SubProcessorRegisterPage = React.lazy(() => import("../pages/SubProcessorRegisterPage"));

const AppRoutes: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthUser | null>(null);
  const [credentials, setCredentials] = useState<Credentials>({
    username: "",
    password: "",
  });
  const [userRole, setUserRole] = useState<"client" | "admin">("client");
  const [organisations, setOrganisations] = useState<AuthenticatedOrganisation[]>([]);
  const [favouritesCatalogueReady, setFavouritesCatalogueReady] = useState(false);
  const catalogueRevision = useRef(0);
  const refreshOrganisations = useCallback(async () => {
    const revision = ++catalogueRevision.current;
    const catalogue = await fetchOrganisations();
    if (revision === catalogueRevision.current) {
      setOrganisations(catalogue);
      setFavouritesCatalogueReady(true);
    }
  }, []);
  const location = useLocation();
  const viewToken = getViewTokenFromLocation(location.search);
  const hasViewToken = Boolean(viewToken);
  const isDemoRoute = location.pathname === "/demo" || location.pathname.startsWith("/demo/");
  const [isSessionChecked, setIsSessionChecked] = useState(hasViewToken);

  useEffect(() => {
    if (hasViewToken) {
      setIsSessionChecked(true);
      return;
    }

    const checkSession = async () => {
      try {
        const me = await fetchMe();
        if (me.ok) {
          setAuthenticatedUser(me.data.user);
          clearDemoSessionLocal();
          const catalogue = await fetchOrganisations().catch(() => null);
          setOrganisations(catalogue ?? []);
          setFavouritesCatalogueReady(catalogue !== null);
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
          setAuthenticatedUser(null);
          setOrganisations([]);
        }
      } catch {
        setIsLoggedIn(false);
        setAuthenticatedUser(null);
      } finally {
        setIsSessionChecked(true);
      }
    };

    checkSession();
  }, [hasViewToken]);

  const handleLogin = async () => {
    clearDemoSessionLocal();
    const me = await fetchMe();
    if (!me.ok) return;
    const nextOrganisations = await fetchOrganisations().catch(() => null);
    setAuthenticatedUser(me.data.user);
    setOrganisations(nextOrganisations ?? []);
    setFavouritesCatalogueReady(nextOrganisations !== null);
    setCredentials({ username: "", password: "" });
    setUserRole("client");
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    catalogueRevision.current += 1;
    clearDemoSessionLocal();
    setIsLoggedIn(false);
    setAuthenticatedUser(null);
    setCredentials({ username: "", password: "" });
    setUserRole("client");
    setOrganisations([]);
    setFavouritesCatalogueReady(false);
  };

  const isDemoSession = isDemoSessionActive();
  const appMode: "public" | "authenticated" | "view_token" | "demo" = hasViewToken
      ? "view_token"
      : (isDemoSession || isDemoRoute)
        ? "demo"
        : isLoggedIn
          ? "authenticated"
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
  const demoAwareSitePath = (siteId: string, subPath = "dashboard") =>
    appMode === "demo" ? `/demo/${siteId}/${subPath}` : `/sites/${siteId}/${subPath}`;
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
        to={appendParams(demoAwareSitePath(resolvedSiteId))}
        replace
      />
    );
  };
  const DemoSiteIndexRedirect: React.FC = () => {
    const { siteId } = useParams();
    const resolvedSiteId = siteId ?? resolveLegacySiteId();
    return (
      <Navigate
        to={appendParams(`/demo/${resolvedSiteId}/dashboard`)}
        replace
      />
    );
  };
  const LegacyDemoSitesRedirect: React.FC = () => {
    const { siteId, "*": remainder } = useParams();
    const resolvedSiteId = siteId ?? resolveLegacySiteId();
    const normalizedRemainder = remainder ? `/${remainder}` : "/dashboard";
    return (
      <Navigate
        to={appendParams(`/demo/${resolvedSiteId}${normalizedRemainder}`)}
        replace
      />
    );
  };
  const SitesSelectorRedirect: React.FC = () => {
    const resolvedSiteId = resolveLegacySiteId();
    return (
      <Navigate
        to={appendParams(demoAwareSitePath(resolvedSiteId), {
          panel: "sites",
        })}
        replace
      />
    );
  };

  if (!isSessionChecked) {
    return null;
  }

  const isCanonicalPortalPath = location.pathname.startsWith("/sites/organisations/");
  const isAccountAppPath = location.pathname === "/home" || location.pathname === "/documents" || location.pathname.startsWith("/settings");
  if (!authenticatedUser && (isCanonicalPortalPath || (appMode === "public" && isAccountAppPath))) {
    return <Navigate to="/login" replace />;
  }

  const renderClientRoute = (element: React.ReactNode) => (
    <VRMLayout userRole={resolvedRole} isAuthenticated={isAuthenticatedMode} onLogout={handleLogout} authenticatedOrganisations={organisations}>
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
  const authenticatedShell = authenticatedUser ? (
    <AuthenticatedApplicationProvider
      user={authenticatedUser}
      organisations={organisations}
      refreshOrganisations={refreshOrganisations}
      favouritesCatalogueReady={favouritesCatalogueReady}
    >
      <AuthenticatedAppShell onLogout={handleLogout} />
    </AuthenticatedApplicationProvider>
  ) : <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route
        path="/"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<LandingPage />)
          ) : appMode === "view_token" || appMode === "demo" ? (
            <Navigate to={appMode === "demo" ? appendParams(`/demo/${getDefaultSiteId()}/dashboard`) : appendViewToken("/sites/all/dashboard")} replace />
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route path="/demo" element={lazyRoute(<DemoPage />)} />
      <Route path="/demo/:organisationSlug/:module" element={lazyRoute(<DemoDashboardRoute />)} />
      <Route path="/demo/:organisationSlug/:siteSlug/:module" element={lazyRoute(<DemoDashboardRoute />)} />
      <Route
        path="/create-account"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<CreateAccountPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/login"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<LoginPage onLogin={handleLogin} />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/verify-email"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<VerifyEmailPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/reset-password"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<ResetPasswordPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/reset-password/code"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<ResetPasswordPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/reset-password/new"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<ResetPasswordPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/contact"
        element={lazyRoute(<ContactPage />)}
      />
      <Route
        path="/terms-and-conditions"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<TermsAndConditionsPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/privacy-policy"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<PrivacyPolicyPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/sub-processor-register"
        element={
          !isAuthenticatedMode ? (
            lazyRoute(<SubProcessorRegisterPage />)
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          shouldAllowAppRoutes ? (
            <Navigate to={appendViewToken(demoAwareSitePath(resolveLegacySiteId()))} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      {shouldAllowAppRoutes && (
        <>
          {appMode === "demo" && (
            <>
              <Route
                path="/sites"
                element={<Navigate to={appendParams(`/demo/${resolveLegacySiteId()}/dashboard`, { panel: "sites" })} replace />}
              />
              <Route
                path="/sites/:siteId/*"
                element={<LegacyDemoSitesRedirect />}
              />
              <Route
                path="/demo/:siteId"
                element={renderClientRoute(
                  <DemoSiteIndexRedirect />,
                )}
              />
            </>
          )}
          <Route
            path="/sites"
            element={isAuthenticatedMode ? <Navigate to="/home" replace /> : <SitesSelectorRedirect />}
          />
          {isAuthenticatedMode && (
            <Route element={authenticatedShell}>
              <Route path="/home" element={<HomePage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
              <Route path="/settings/account" element={<MyAccountPage />} />
              <Route path="/settings/access" element={<ManageAccessPage />} />
              <Route path="/settings/alarms" element={<Navigate to="/settings/account" replace />} />
              <Route
                path="/sites/organisations/:organisationId/:module"
                element={<AuthenticatedOrganisationPortalRoute />}
              />
              <Route
                path="/sites/organisations/:organisationId/sites/:siteId/:module"
                element={<AuthenticatedOrganisationPortalRoute />}
              />
            </Route>
          )}
          {!isAuthenticatedMode && (
            <>
              <Route path="/home" element={<Navigate to={appendViewToken(demoAwareSitePath(resolveLegacySiteId()))} replace />} />
              <Route path="/settings" element={<Navigate to={appendViewToken(demoAwareSitePath(resolveLegacySiteId()))} replace />} />
              <Route path="/settings/account" element={<Navigate to={appendViewToken(demoAwareSitePath(resolveLegacySiteId()))} replace />} />
              <Route path="/settings/access" element={<Navigate to={appendViewToken(demoAwareSitePath(resolveLegacySiteId()))} replace />} />
              <Route path="/settings/alarms" element={<Navigate to="/settings/account" replace />} />
              <Route path="/documents" element={<Navigate to={appendViewToken(demoAwareSitePath(resolveLegacySiteId()))} replace />} />
            </>
          )}
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
                  donutTooltipMode="legacy"
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
          !isAuthenticatedMode ? (
            <Navigate to="/" replace />
          ) : appMode === "view_token" || appMode === "demo" ? (
            <Navigate to={appMode === "demo" ? appendParams(`/demo/${getDefaultSiteId()}/dashboard`) : appendViewToken("/sites/all/dashboard")} replace />
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
