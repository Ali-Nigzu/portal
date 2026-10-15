import React, {
  Suspense,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";
import {
  clearDemoSessionLocal,
  isDemoSessionActive,
} from "../features/organisation-dashboard/demoSession";
import { dashboardSearch } from "../features/organisation-dashboard/selection";
import { bindAccountRequests, fetchMe, logout, type AuthUser } from "../features/auth/transport/me";
import {
  fetchOrganisations,
  type AuthenticatedOrganisation,
} from "../features/organisation-dashboard/api";
import { AuthenticatedApplicationProvider } from "../context/AuthenticatedApplicationContext";
import AuthenticatedVRMLayout from "../components/AuthenticatedVRMLayout";
import {
  isPortalModule,
  sitePortalPath,
} from "../features/organisation-dashboard/authenticatedPortalRoutes";
import ErrorBoundary, { isAssetLoadError } from "../common/components/ErrorBoundary";

function routeComponents() {
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
  const CookiePolicyPage = React.lazy(() => import("../features/legal/CookiePolicyPage"));
  const SubProcessorRegisterPage = React.lazy(
    () => import("../features/legal/SubProcessorRegisterPage"),
  );

  return { AdminApp, HomePage, DocumentsPage, MyAccountPage, ManageAccessPage, LandingPage, LoginPage, CreateAccountPage, VerifyEmailPage, ResetPasswordPage, ContactPage, DemoDashboardRoute, AuthenticatedOrganisationPortalRoute, TermsAndConditionsPage, PrivacyPolicyPage, CookiePolicyPage, SubProcessorRegisterPage };
}

const initialRoutes = routeComponents();

// An unscoped URL is navigation only. The authenticated catalogue must establish
// one real organisation/site pair before the canonical Portal can render.
function UnscopedSiteRedirect({
  organisations,
  demo,
  authenticated,
}: {
  organisations: AuthenticatedOrganisation[];
  demo: boolean;
  authenticated: boolean;
}) {
  const { siteId, "*": remainder } = useParams();
  const location = useLocation();
  const module = remainder || "dashboard";
  if (!isPortalModule(module))
    return <div role="alert">Portal page not found.</div>;
  if (demo)
    return (
      <Navigate
        replace
        to={`/demo/${encodeURIComponent(siteId ?? "")}/${module}${dashboardSearch(location.search)}`}
      />
    );
  if (!authenticated) return <Navigate to="/login" replace />;
  const owners = organisations.filter((org) =>
    org.sites.some((site) => site.id === siteId),
  );
  if (owners.length !== 1 || !siteId)
    return <div role="alert">An authorised Portal context is required.</div>;
  return (
    <Navigate
      replace
      to={`${sitePortalPath(owners[0].id, siteId, module)}${dashboardSearch(location.search)}`}
    />
  );
}
function DemoIndexRedirect() {
  const { siteId } = useParams();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/demo/${encodeURIComponent(siteId ?? "")}/dashboard${dashboardSearch(location.search)}`}
    />
  );
}
const AppRoutes: React.FC = () => {
  const navigate = useNavigate();
  const [routeAttempt, setRouteAttempt] = useState(0);
  const { AdminApp, HomePage, DocumentsPage, MyAccountPage, ManageAccessPage, LandingPage, LoginPage, CreateAccountPage, VerifyEmailPage, ResetPasswordPage, ContactPage, DemoDashboardRoute, AuthenticatedOrganisationPortalRoute, TermsAndConditionsPage, PrivacyPolicyPage, CookiePolicyPage, SubProcessorRegisterPage } = useMemo(() => routeAttempt === 0 ? initialRoutes : routeComponents(), [routeAttempt]);
  const retryRoute = (message?: string) => {
    setRouteAttempt(value => value + 1);
    // Browsers may cache a failed module fetch too. An explicit retry reloads
    // asset failures; ordinary rendering failures retry fresh lazy instances.
    if (isAssetLoadError(message ?? "")) window.location.reload();
  };
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [sessionError, setSessionError] = useState(false);
  const [catalogueError, setCatalogueError] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthUser | null>(
    null,
  );
  const [organisations, setOrganisations] = useState<
    AuthenticatedOrganisation[]
  >([]);
  const [favouritesCatalogueReady, setFavouritesCatalogueReady] =
    useState(false);
  const catalogueRevision = useRef(0);
  const accountRevision = useRef(0);
  const actorEpoch = useRef(0);
  const accountController = useRef(new AbortController());
  const [accountSignal, setAccountSignal] = useState(accountController.current.signal);
  const renewAccountSignal = () => {
    accountController.current.abort();
    accountController.current = new AbortController();
    setAccountSignal(accountController.current.signal);
  };
  const userRef = useRef<AuthUser | null>(null);
  const probe = useRef<Promise<void> | null>(null);
  const location = useLocation();
  const viewToken = new URLSearchParams(location.search).get("view_token");
  const hasViewToken = Boolean(viewToken);
  const isDemoRoute = location.pathname === "/demo" || location.pathname.startsWith("/demo/");
  const demoAlias = location.pathname === "/dashboard" || location.pathname === "/sites" || /^\/sites\/(?!organisations(?:\/|$))/.test(location.pathname);
  const [demoSessionActive, setDemoSessionActive] = useState(isDemoSessionActive);
  const previousDemoRoute = useRef(isDemoRoute);
  const [isSessionChecked, setIsSessionChecked] = useState(hasViewToken);
  useEffect(() => {
    const changed = () => setDemoSessionActive(isDemoSessionActive());
    window.addEventListener("demo-session-changed", changed);
    return () => window.removeEventListener("demo-session-changed", changed);
  }, []);
  useEffect(() => {
    if (!isDemoRoute && !demoAlias && (previousDemoRoute.current || isDemoSessionActive())) clearDemoSessionLocal();
    previousDemoRoute.current = isDemoRoute;
  }, [isDemoRoute, demoAlias]);

  const applyAccount = useCallback((user: AuthUser | null) => {
    if (userRef.current?.id !== user?.id || (user && accountController.current.signal.aborted)) {
      actorEpoch.current += 1;
      catalogueRevision.current += 1;
      renewAccountSignal();
      setOrganisations([]);
      setFavouritesCatalogueReady(false);
      setCatalogueError(false);
    }
    userRef.current = user;
    bindAccountRequests(user?.id ?? null, accountController.current.signal);
    setAuthenticatedUser(user);
  }, []);
  const clearAccount = useCallback(() => {
    accountRevision.current += 1;
    applyAccount(null);
    accountController.current.abort();
    bindAccountRequests(null, accountController.current.signal);
    setSessionError(false);
    setIsSessionChecked(true);
  }, [applyAccount]);

  const revalidateAccount = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!probe.current) {
      const revision = ++accountRevision.current;
      const pending = (async () => {
        try {
          const me = await fetchMe();
          if (revision !== accountRevision.current) throw new DOMException("Aborted", "AbortError");
          if (me.ok) applyAccount(me.data.user);
          else if (me.status === 401) clearAccount();
          else throw new Error("Please try again.");
          setSessionError(false);
          setIsSessionChecked(true);
        } catch (error) {
          if (revision === accountRevision.current) setSessionError(true);
          throw error;
        }
      })();
      probe.current = pending;
      void pending.finally(() => { if (probe.current === pending) probe.current = null; }).catch(() => {});
    }
    await probe.current;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }, [applyAccount, clearAccount]);

  const refreshOrganisations = useCallback(async (signal = accountController.current.signal) => {
    await revalidateAccount(signal);
    if (!userRef.current || signal.aborted) throw new DOMException("Aborted", "AbortError");
    const revision = ++catalogueRevision.current;
    try {
      const catalogue = await fetchOrganisations(signal);
      if (!signal.aborted && revision === catalogueRevision.current) {
        setOrganisations(catalogue);
        setFavouritesCatalogueReady(true);
        setCatalogueError(false);
      }
    } catch (error) {
      if (!signal.aborted && revision === catalogueRevision.current) {
        setCatalogueError(true);
        setFavouritesCatalogueReady(false);
      }
      throw error;
    }
  }, [revalidateAccount]);

  useEffect(() => {
    if (accountController.current.signal.aborted) {
      renewAccountSignal();
      bindAccountRequests(userRef.current?.id ?? null, accountController.current.signal);
    }
    return () => {
      accountRevision.current += 1;
      probe.current = null;
      accountController.current.abort();
      bindAccountRequests(null, accountController.current.signal);
    };
  }, []);

  useEffect(() => {
    const rejected = (event: Event) => {
      const detail = (event as CustomEvent<{signal: AbortSignal; reason: string}>).detail;
      if (!detail || detail.signal !== accountController.current.signal || detail.signal.aborted) return;
      if (detail.reason === "session_invalid") clearAccount();
      else void revalidateAccount(detail.signal).catch(() => {});
    };
    window.addEventListener("camos:account-rejected", rejected);
    return () => window.removeEventListener("camos:account-rejected", rejected);
  }, [clearAccount, revalidateAccount]);

  useEffect(() => {
    if (hasViewToken) { setIsSessionChecked(true); return; }
    void revalidateAccount().catch(() => {});
  }, [hasViewToken, sessionAttempt, revalidateAccount]);

  useEffect(() => {
    if (!authenticatedUser) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    // Only reads are retried. A failed refresh never becomes an empty list.
    const load = (attempt: number) => void refreshOrganisations().catch(() => {
      if (active && attempt < 2 && !accountSignal.aborted)
        timer = setTimeout(() => load(attempt + 1), 1000 * (attempt + 1));
    });
    load(0);
    return () => { active = false; clearTimeout(timer); };
  }, [authenticatedUser?.id, accountSignal, refreshOrganisations]);

  useEffect(() => {
    if (!authenticatedUser || isDemoRoute) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void revalidateAccount(accountController.current.signal).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authenticatedUser?.id, isDemoRoute, revalidateAccount]);

  const handleLogin = async () => {
    accountRevision.current += 1;
    probe.current = null;
    clearDemoSessionLocal();
    await revalidateAccount();
    if (!userRef.current) throw new Error("Please try again.");
  };
  const handleLogout = async () => {
    const pending = logout();
    accountController.current.abort();
    try { await pending; }
    catch (error) {
      applyAccount(userRef.current);
      void revalidateAccount(accountController.current.signal).catch(() => {});
      throw error;
    }
    clearDemoSessionLocal();
    clearAccount();
  };

  const demo = demoSessionActive || isDemoRoute;
  const authenticated = Boolean(authenticatedUser) && !demo && !hasViewToken;
  const lazyRoute = (element: React.ReactNode) => (
    <Suspense fallback={<div className="vrm-content-loading" role="status">Loading…</div>}>{element}</Suspense>
  );
  const renderedEpoch = actorEpoch.current;
  const refreshBoundOrganisations = useCallback(() => refreshOrganisations(accountSignal), [accountSignal, refreshOrganisations]);
  const recordOrganisation = useCallback((organisation: AuthenticatedOrganisation) => {
    if (!accountSignal.aborted) setOrganisations(previous => [...previous.filter(item => item.id !== organisation.id), organisation]);
  }, [accountSignal]);
  const removeOrganisation = useCallback((id: string) => {
    if (!accountSignal.aborted) setOrganisations(previous => previous.filter(item => item.id !== id));
  }, [accountSignal]);
  const refreshAccount = async (confirmed?: AuthUser) => {
    if (renderedEpoch !== actorEpoch.current || accountSignal.aborted) return;
    if (confirmed && confirmed.id === userRef.current?.id) applyAccount(confirmed);
    else await revalidateAccount(accountSignal);
  };
  const authenticatedShell = authenticatedUser ? (
    <AuthenticatedApplicationProvider
      key={authenticatedUser.id}
      user={authenticatedUser}
      accountSignal={accountSignal}
      refreshAccount={refreshAccount}
      organisations={favouritesCatalogueReady ? organisations : []}
      refreshOrganisations={refreshBoundOrganisations}
      favouritesCatalogueReady={favouritesCatalogueReady}
      catalogueError={catalogueError}
      recordOrganisation={recordOrganisation}
      removeOrganisation={removeOrganisation}
    >
      <AuthenticatedVRMLayout onLogout={handleLogout} />
    </AuthenticatedApplicationProvider>
  ) : (
    <Navigate to="/login" replace />
  );
  if (
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/")
  ) {
    return (
      <Suspense fallback={<p>Loading Admin…</p>}>
        <ErrorBoundary name="admin-route" resetKey={location.key + routeAttempt}
          onRetry={retryRoute} onReload={() => window.location.reload()}>
          <AdminApp />
        </ErrorBoundary>
      </Suspense>
    );
  }
  const publicRoute = isDemoRoute || /^\/(contact|login|create-account|verify-email|reset-password(?:\/.*)?|terms-and-conditions|privacy-policy|cookie-policy|sub-processor-register)$/.test(location.pathname);
  if (sessionError && !publicRoute) return (
    <div role="alert">
      <p>Can't load your account. Try again.</p>
      <button className="vrm-btn" onClick={() => setSessionAttempt(value => value + 1)}>Retry</button>
    </div>
  );
  if (!isSessionChecked && !publicRoute) return <div className="vrm-content-loading" role="status">Loading…</div>;
  // Tokens are rejected; they never establish application identity or scope.
  if (
    hasViewToken &&
    (location.pathname === "/dashboard" ||
      location.pathname.startsWith("/sites") ||
      isDemoRoute)
  ) {
    return (
      <div role="alert">
        {
          'Failed to load dashboard manifest (status 401). {"detail":"Invalid or expired view token"}'
        }
      </div>
    );
  }
  const accountRedirect = <Navigate to={demo ? "/demo" : "/login"} replace />;
  return (
    <>
    <ErrorBoundary name="route" resetKey={location.key + routeAttempt}
      onRetry={retryRoute}
      onReload={() => window.location.reload()} onHome={() => navigate("/home")}>
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route element={authenticated ? authenticatedShell : undefined}>
        <Route
          path="/home"
          element={authenticated ? <HomePage /> : lazyRoute(<LandingPage />)}
        />
        <Route
          path="/documents"
          element={authenticated ? <DocumentsPage /> : accountRedirect}
        />
        <Route
          path="/settings"
          element={
            authenticated ? (
              <Navigate to="/settings/account" replace />
            ) : (
              accountRedirect
            )
          }
        />
        <Route
          path="/settings/account"
          element={authenticated ? <MyAccountPage /> : accountRedirect}
        />
        <Route
          path="/settings/access"
          element={authenticated ? <ManageAccessPage /> : accountRedirect}
        />
        <Route
          path="/settings/alarms"
          element={<Navigate to="/settings/account" replace />}
        />
        <Route
          path="/sites/organisations/:organisationId/:module"
          element={
            authenticated ? (
              <AuthenticatedOrganisationPortalRoute />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/sites/organisations/:organisationId/sites/:siteId/:module"
          element={
            authenticated ? (
              <AuthenticatedOrganisationPortalRoute />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Route>
      <Route path="/demo" element={lazyRoute(<DemoDashboardRoute />)} />
      <Route path="/demo/:siteId" element={<DemoIndexRedirect />} />
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
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<CreateAccountPage />)
          )
        }
      />
      <Route
        path="/login"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<LoginPage onLogin={handleLogin} />)
          )
        }
      />
      <Route
        path="/verify-email"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<VerifyEmailPage />)
          )
        }
      />
      <Route
        path="/reset-password"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<ResetPasswordPage />)
          )
        }
      />
      <Route
        path="/reset-password/code"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<ResetPasswordPage />)
          )
        }
      />
      <Route
        path="/reset-password/new"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<ResetPasswordPage />)
          )
        }
      />
      <Route path="/contact" element={lazyRoute(<ContactPage />)} />
      <Route
        path="/terms-and-conditions"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<TermsAndConditionsPage />)
          )
        }
      />
      <Route path="/cookie-policy" element={lazyRoute(<CookiePolicyPage />)} />
      <Route
        path="/privacy-policy"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<PrivacyPolicyPage />)
          )
        }
      />
      <Route
        path="/sub-processor-register"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            lazyRoute(<SubProcessorRegisterPage />)
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          <Navigate
            to={demo ? "/demo" : authenticated ? "/home" : "/login"}
            replace
          />
        }
      />
      <Route
        path="/sites"
        element={
          <Navigate
            to={demo ? "/demo?panel=sites" : authenticated ? "/home" : "/login"}
            replace
          />
        }
      />
      <Route
        path="/sites/:siteId/*"
        element={
          <UnscopedSiteRedirect
            organisations={organisations}
            demo={demo}
            authenticated={authenticated}
          />
        }
      />
      <Route
        path="*"
        element={<Navigate to={authenticated ? "/home" : "/"} replace />}
      />
    </Routes>
    </ErrorBoundary>
    </>
  );
};
export default AppRoutes;
