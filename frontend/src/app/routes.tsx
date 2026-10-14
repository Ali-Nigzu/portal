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
import { fetchMe, logout, type AuthUser } from "../features/auth/transport/me";
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
  const SubProcessorRegisterPage = React.lazy(
    () => import("../features/legal/SubProcessorRegisterPage"),
  );

  return { AdminApp, HomePage, DocumentsPage, MyAccountPage, ManageAccessPage, LandingPage, LoginPage, CreateAccountPage, VerifyEmailPage, ResetPasswordPage, ContactPage, DemoDashboardRoute, AuthenticatedOrganisationPortalRoute, TermsAndConditionsPage, PrivacyPolicyPage, SubProcessorRegisterPage };
}

const initialRoutes = routeComponents();

async function withDeadline<T>(load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = window.setTimeout(abort, 12_000);
  try { return await load(controller.signal); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

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
  const { AdminApp, HomePage, DocumentsPage, MyAccountPage, ManageAccessPage, LandingPage, LoginPage, CreateAccountPage, VerifyEmailPage, ResetPasswordPage, ContactPage, DemoDashboardRoute, AuthenticatedOrganisationPortalRoute, TermsAndConditionsPage, PrivacyPolicyPage, SubProcessorRegisterPage } = useMemo(() => routeAttempt === 0 ? initialRoutes : routeComponents(), [routeAttempt]);
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
  const refreshOrganisations = useCallback(async () => {
    const revision = ++catalogueRevision.current;
    try {
      const catalogue = await withDeadline(fetchOrganisations);
      if (revision === catalogueRevision.current) {
        setOrganisations(catalogue);
        setFavouritesCatalogueReady(true);
        setCatalogueError(false);
      }
    } catch (error) {
      if (revision === catalogueRevision.current) {
        setCatalogueError(true);
        setFavouritesCatalogueReady(false);
      }
      throw error;
    }
  }, []);
  const location = useLocation();
  const viewToken = new URLSearchParams(location.search).get("view_token");
  const hasViewToken = Boolean(viewToken);
  const isDemoRoute =
    location.pathname === "/demo" || location.pathname.startsWith("/demo/");
  const [isSessionChecked, setIsSessionChecked] = useState(hasViewToken);

  useEffect(() => {
    if (hasViewToken) {
      setSessionError(false);
      setIsSessionChecked(true);
      return;
    }

    setSessionError(false);
    const abort = new AbortController();
    const revision = ++accountRevision.current;
    const catalogueVersion = ++catalogueRevision.current;
    const current = () => !abort.signal.aborted && revision === accountRevision.current;
    const checkSession = async () => {
      try {
        const me = await withDeadline(fetchMe, abort.signal);
        if (!current()) return;
        if (me.ok) {
          clearDemoSessionLocal();
          setAuthenticatedUser(me.data.user);
          setIsSessionChecked(true);
          try {
            const catalogue = await withDeadline(fetchOrganisations, abort.signal);
            if (current() && catalogueVersion === catalogueRevision.current) {
              setOrganisations(catalogue);
              setFavouritesCatalogueReady(true);
              setCatalogueError(false);
            }
          } catch {
            if (current() && catalogueVersion === catalogueRevision.current) {
              setFavouritesCatalogueReady(false);
              setCatalogueError(true);
            }
          }
        } else if (me.status === 401) {
          setAuthenticatedUser(null);
          setOrganisations([]);
          setFavouritesCatalogueReady(false);
          setIsSessionChecked(true);
        } else {
          throw new Error("Session unavailable");
        }
      } catch {
        if (current()) setSessionError(true);
      }
    };
    void checkSession();
    return () => abort.abort();

  }, [hasViewToken, sessionAttempt]);

  const handleLogin = async () => {
    actorEpoch.current += 1;
    renewAccountSignal();
    const revision = ++accountRevision.current;
    const catalogueVersion = ++catalogueRevision.current;
    clearDemoSessionLocal();
    const me = await withDeadline(fetchMe);
    if (!me.ok) throw new Error("Unable to confirm sign-in. Please try again.");
    if (revision !== accountRevision.current) return;
    setAuthenticatedUser(me.data.user);
    setIsSessionChecked(true);
    setSessionError(false);
    setOrganisations([]);
    setFavouritesCatalogueReady(false);
    const nextOrganisations = await withDeadline(fetchOrganisations).catch(() => null);
    if (revision !== accountRevision.current) return;
    if (catalogueVersion === catalogueRevision.current) {
      setOrganisations(nextOrganisations ?? []);
      setFavouritesCatalogueReady(nextOrganisations !== null);
      setCatalogueError(nextOrganisations === null);
    }
  };

  const clearAccount = () => {
    actorEpoch.current += 1;
    accountController.current.abort();
    accountRevision.current += 1;
    catalogueRevision.current += 1;
    clearDemoSessionLocal();

    setAuthenticatedUser(null);
    setOrganisations([]);
    setFavouritesCatalogueReady(false);
    setCatalogueError(false);
    setSessionError(false);
  };
  const handleLogout = async () => {
    // Cancel cookie-bearing account writes before acknowledging logout.
    accountController.current.abort();
    try {
      await logout();
    } catch (error) {
      renewAccountSignal();
      throw error;
    }
    clearAccount();
  };

  const demo = isDemoSessionActive() || isDemoRoute;
  const authenticated = Boolean(authenticatedUser) && !demo && !hasViewToken;
  const lazyRoute = (element: React.ReactNode) => (
    <Suspense fallback={<div className="vrm-content-loading" role="status">Loading…</div>}>{element}</Suspense>
  );
  const renderedEpoch = actorEpoch.current;
  const refreshAccount = async (confirmed?: AuthUser) => {
    if (renderedEpoch !== actorEpoch.current || accountController.current.signal.aborted) return;
    const revision = ++accountRevision.current;
    if (confirmed) { setAuthenticatedUser(confirmed); return; }
    const me = await fetchMe();
    if (revision !== accountRevision.current || renderedEpoch !== actorEpoch.current) return;
    if (!me.ok) {
      if (me.status === 401) clearAccount();
      else throw new Error("Unable to refresh account. Please try again.");
      return;
    }
    setAuthenticatedUser(me.data.user);
  };
  const authenticatedShell = authenticatedUser ? (
    <AuthenticatedApplicationProvider
      key={authenticatedUser.id}
      user={authenticatedUser}
      accountSignal={accountSignal}
      refreshAccount={refreshAccount}
      organisations={favouritesCatalogueReady ? organisations : []}
      refreshOrganisations={refreshOrganisations}
      favouritesCatalogueReady={favouritesCatalogueReady}
      catalogueError={catalogueError}
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
  const publicRoute = isDemoRoute || /^\/(contact|login|create-account|verify-email|reset-password(?:\/.*)?|terms-and-conditions|privacy-policy|sub-processor-register)$/.test(location.pathname);
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
