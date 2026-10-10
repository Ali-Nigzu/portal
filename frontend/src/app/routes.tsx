import React, {
  Suspense,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
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
} from "../features/organisation-dashboard/demoSession";
import {
  getDefaultSiteId,
  getStoredSiteId,
} from "../features/organisation-dashboard/selection";
import { fetchMe } from "../features/auth/transport/me";
import type { AuthUser } from "../features/auth/transport/me";
import {
  fetchOrganisations,
  type AuthenticatedOrganisation,
} from "../features/organisation-dashboard/api";
import { AuthenticatedApplicationProvider } from "../context/AuthenticatedApplicationContext";
import AuthenticatedAppShell from "../components/AuthenticatedAppShell";

const HistoricalDashboardRoute = React.lazy(() =>
  import("../features/organisation-dashboard/OrganisationDashboardPage").then(
    (module) => ({ default: module.HistoricalDashboardRoute }),
  ),
);
const EventLogsPage = React.lazy(
  () => import("../features/events/EventLogsPage"),
);
const AlarmLogsPage = React.lazy(
  () => import("../features/alarms/AlarmLogsPage"),
);
const DeviceListPage = React.lazy(
  () => import("../features/devices/DeviceListPage"),
);
const ReportsPage = React.lazy(() => import("../features/reports/ReportsPage"));
const AdminApp = React.lazy(
  () => import("../features/internal-admin/AdminApp"),
);
const HomePage = React.lazy(() => import("../features/home/HomePage"));
const DocumentsPage = React.lazy(
  () => import("../features/documents/DocumentsPage"),
);
const MyAccountPage = React.lazy(
  () => import("../features/settings/pages/MyAccountPage"),
);
const ManageAccessPage = React.lazy(
  () => import("../features/organisation-access/ManageAccessPage"),
);
const LandingPage = React.lazy(() => import("../features/landing/LandingPage"));
const LoginPage = React.lazy(() => import("../features/auth/LoginPage"));
const CreateAccountPage = React.lazy(
  () => import("../features/auth/CreateAccountPage"),
);
const VerifyEmailPage = React.lazy(
  () => import("../features/auth/VerifyEmailPage"),
);
const ResetPasswordPage = React.lazy(
  () => import("../features/auth/ResetPasswordPage"),
);
const ContactPage = React.lazy(() => import("../features/contact/ContactPage"));
const DemoDashboardRoute = React.lazy(
  () => import("../features/organisation-dashboard/DemoDashboardRoute"),
);
const DemoPage = React.lazy(
  () => import("../features/organisation-dashboard/DemoDashboardRoute"),
);
const AuthenticatedOrganisationPortalRoute = React.lazy(
  () =>
    import("../features/organisation-dashboard/AuthenticatedOrganisationPortalRoute"),
);
const TermsAndConditionsPage = React.lazy(
  () => import("../features/legal/TermsAndConditionsPage"),
);
const PrivacyPolicyPage = React.lazy(
  () => import("../features/legal/PrivacyPolicyPage"),
);
const SubProcessorRegisterPage = React.lazy(
  () => import("../features/legal/SubProcessorRegisterPage"),
);

const getViewTokenFromLocation = (search: string) =>
  new URLSearchParams(search).get("view_token") ?? undefined;

const AppRoutes: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthUser | null>(
    null,
  );
  const userRole = "client" as const;
  const [organisations, setOrganisations] = useState<
    AuthenticatedOrganisation[]
  >([]);
  const [favouritesCatalogueReady, setFavouritesCatalogueReady] =
    useState(false);
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
  const isDemoRoute =
    location.pathname === "/demo" || location.pathname.startsWith("/demo/");
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
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    catalogueRevision.current += 1;
    clearDemoSessionLocal();
    setIsLoggedIn(false);
    setAuthenticatedUser(null);
    setOrganisations([]);
    setFavouritesCatalogueReady(false);
  };

  const isDemoSession = isDemoSessionActive();
  const appMode: "public" | "authenticated" | "view_token" | "demo" =
    hasViewToken
      ? "view_token"
      : isDemoSession || isDemoRoute
        ? "demo"
        : isLoggedIn
          ? "authenticated"
          : "public";
  const isAuthenticatedMode = appMode === "authenticated";
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
    appMode === "demo"
      ? `/demo/${siteId}/${subPath}`
      : `/sites/${siteId}/${subPath}`;
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
      <Navigate to={appendParams(demoAwareSitePath(resolvedSiteId))} replace />
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

  if (
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/")
  ) {
    return (
      <Suspense fallback={<p>Loading Admin…</p>}>
        <AdminApp />
      </Suspense>
    );
  }

  if (!isSessionChecked) {
    return null;
  }

  const isCanonicalPortalPath = location.pathname.startsWith(
    "/sites/organisations/",
  );
  const isAccountAppPath =
    location.pathname === "/documents" ||
    location.pathname.startsWith("/settings");
  if (
    !authenticatedUser &&
    (isCanonicalPortalPath || (appMode === "public" && isAccountAppPath))
  ) {
    return <Navigate to="/login" replace />;
  }

  const renderClientRoute = (element: React.ReactNode) => (
    <VRMLayout
      userRole={resolvedRole}
      isAuthenticated={isAuthenticatedMode}
      onLogout={handleLogout}
      authenticatedOrganisations={organisations}
    >
      {element}
    </VRMLayout>
  );

  const lazyRoute = (element: React.ReactNode) => (
    <Suspense fallback={null}>{element}</Suspense>
  );
  const refreshAccount = async () => {
    const me = await fetchMe();
    if (!me.ok) {
      handleLogout();
      return;
    }
    setAuthenticatedUser(me.data.user);
  };
  const authenticatedShell = authenticatedUser ? (
    <AuthenticatedApplicationProvider
      user={authenticatedUser}
      refreshAccount={refreshAccount}
      organisations={organisations}
      refreshOrganisations={refreshOrganisations}
      favouritesCatalogueReady={favouritesCatalogueReady}
    >
      <AuthenticatedAppShell onLogout={handleLogout} />
    </AuthenticatedApplicationProvider>
  ) : (
    <Navigate to="/login" replace />
  );

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      {!isAuthenticatedMode && (
        <Route path="/home" element={lazyRoute(<LandingPage />)} />
      )}
      <Route path="/demo" element={lazyRoute(<DemoPage />)} />
      <Route
        path="/demo/:organisationSlug/:module"
        element={lazyRoute(<DemoDashboardRoute />)}
      />
      <Route
        path="/demo/:organisationSlug/:siteSlug/:module"
        element={lazyRoute(<DemoDashboardRoute />)}
      />
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
      <Route path="/contact" element={lazyRoute(<ContactPage />)} />
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
            <Navigate
              to={appendViewToken(demoAwareSitePath(resolveLegacySiteId()))}
              replace
            />
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
                element={
                  <Navigate
                    to={appendParams(
                      `/demo/${resolveLegacySiteId()}/dashboard`,
                      { panel: "sites" },
                    )}
                    replace
                  />
                }
              />
              <Route
                path="/sites/:siteId/*"
                element={<LegacyDemoSitesRedirect />}
              />
              <Route
                path="/demo/:siteId"
                element={renderClientRoute(<DemoSiteIndexRedirect />)}
              />
            </>
          )}
          <Route
            path="/sites"
            element={
              isAuthenticatedMode ? (
                <Navigate to="/home" replace />
              ) : (
                <SitesSelectorRedirect />
              )
            }
          />
          {isAuthenticatedMode && (
            <Route element={authenticatedShell}>
              <Route path="/home" element={<HomePage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route
                path="/settings"
                element={<Navigate to="/settings/account" replace />}
              />
              <Route path="/settings/account" element={<MyAccountPage />} />
              <Route path="/settings/access" element={<ManageAccessPage />} />
              <Route
                path="/settings/alarms"
                element={<Navigate to="/settings/account" replace />}
              />
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
              <Route
                path="/settings"
                element={
                  <Navigate
                    to={appendViewToken(
                      demoAwareSitePath(resolveLegacySiteId()),
                    )}
                    replace
                  />
                }
              />
              <Route
                path="/settings/account"
                element={
                  <Navigate
                    to={appendViewToken(
                      demoAwareSitePath(resolveLegacySiteId()),
                    )}
                    replace
                  />
                }
              />
              <Route
                path="/settings/access"
                element={
                  <Navigate
                    to={appendViewToken(
                      demoAwareSitePath(resolveLegacySiteId()),
                    )}
                    replace
                  />
                }
              />
              <Route
                path="/settings/alarms"
                element={<Navigate to="/settings/account" replace />}
              />
              <Route
                path="/documents"
                element={
                  <Navigate
                    to={appendViewToken(
                      demoAwareSitePath(resolveLegacySiteId()),
                    )}
                    replace
                  />
                }
              />
            </>
          )}
          <Route
            path="/sites/:siteId"
            element={renderClientRoute(<SiteIndexRedirect />)}
          />
          <Route
            path="/sites/:siteId/dashboard"
            element={renderClientRoute(
              lazyRoute(
                <HistoricalDashboardRoute
                  isAuthenticatedView={isAuthenticatedMode}
                />,
              ),
            )}
          />
          <Route
            path="/sites/:siteId/event-logs"
            element={renderClientRoute(lazyRoute(<EventLogsPage />))}
          />
          <Route
            path="/sites/:siteId/alarm-logs"
            element={renderClientRoute(lazyRoute(<AlarmLogsPage />))}
          />
          <Route
            path="/sites/:siteId/device-list"
            element={renderClientRoute(lazyRoute(<DeviceListPage />))}
          />
          <Route
            path="/sites/:siteId/reports"
            element={renderClientRoute(lazyRoute(<ReportsPage />))}
          />
        </>
      )}
      <Route
        path="*"
        element={
          !isAuthenticatedMode ? (
            <Navigate to="/" replace />
          ) : appMode === "view_token" || appMode === "demo" ? (
            <Navigate
              to={
                appMode === "demo"
                  ? appendParams(`/demo/${getDefaultSiteId()}/dashboard`)
                  : appendViewToken("/sites/all/dashboard")
              }
              replace
            />
          ) : (
            <Navigate to="/home" replace />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
