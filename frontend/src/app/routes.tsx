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
    const catalogue = await fetchOrganisations();
    if (revision === catalogueRevision.current) {
      setOrganisations(catalogue);
      setFavouritesCatalogueReady(true);
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
      setIsSessionChecked(true);
      return;
    }

    const abort = new AbortController();
    const revision = ++accountRevision.current;
    const catalogueVersion = ++catalogueRevision.current;
    const current = () => !abort.signal.aborted && revision === accountRevision.current;
    const checkSession = async () => {
      try {
        const me = await fetchMe(abort.signal);
        if (!current()) return;
        if (me.ok) {
          clearDemoSessionLocal();
          const catalogue = await fetchOrganisations(abort.signal).catch(() => null);
          if (!current()) return;
          setAuthenticatedUser(me.data.user);
          if (catalogueVersion === catalogueRevision.current) {
            setOrganisations(catalogue ?? []);
            setFavouritesCatalogueReady(catalogue !== null);
          }
        } else if (me.status === 401) {
          setAuthenticatedUser(null);
          setOrganisations([]);
          setFavouritesCatalogueReady(false);
        }
      } catch {
        // Availability failures do not invalidate an already confirmed session.
      } finally {
        if (current()) setIsSessionChecked(true);
      }
    };
    void checkSession();
    return () => abort.abort();

  }, [hasViewToken]);

  const handleLogin = async () => {
    actorEpoch.current += 1;
    renewAccountSignal();
    const revision = ++accountRevision.current;
    const catalogueVersion = ++catalogueRevision.current;
    clearDemoSessionLocal();
    const me = await fetchMe();
    if (!me.ok) throw new Error("Unable to confirm sign-in. Please try again.");
    const nextOrganisations = await fetchOrganisations().catch(() => null);
    if (revision !== accountRevision.current) return;
    setAuthenticatedUser(me.data.user);
    setIsSessionChecked(true);
    if (catalogueVersion === catalogueRevision.current) {
      setOrganisations(nextOrganisations ?? []);
      setFavouritesCatalogueReady(nextOrganisations !== null);
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
    <Suspense fallback={null}>{element}</Suspense>
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
      organisations={organisations}
      refreshOrganisations={refreshOrganisations}
      favouritesCatalogueReady={favouritesCatalogueReady}
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
        <AdminApp />
      </Suspense>
    );
  }
  if (!isSessionChecked) return null;
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
  );
};
export default AppRoutes;
