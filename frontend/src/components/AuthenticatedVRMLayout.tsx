import { OrganisationAccessProvider } from "../features/organisation-access/OrganisationAccessContext";
import { Suspense, useEffect, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import AuthenticatedNavigationPod from "./authenticated-navigation/AuthenticatedNavigationPod";
import { useAuthenticatedNavigation } from "./authenticated-navigation/useAuthenticatedNavigation";
import "../styles/VRMTheme.css";
import "../styles/AuthenticatedNavigation.css";
import { useAuthenticatedApplication } from "../context/AuthenticatedApplicationContext";

export default function AuthenticatedVRMLayout({
  onLogout,
}: {
  onLogout?: () => void | Promise<void>;
}) {
  const { organisations, favouritesCatalogueReady } =
    useAuthenticatedApplication();
  const navigate = useNavigate();
  const navigation = useAuthenticatedNavigation(organisations);
  const activeOrganisation = useMemo(() => {
    const route = navigation.routeContext;
    return route.area === "portal"
      ? organisations.find(
          (organisation) => organisation.id === route.organisationId,
        )
      : undefined;
  }, [navigation.routeContext, organisations]);

  useEffect(() => {
    if (
      favouritesCatalogueReady &&
      navigation.routeContext.area === "portal" &&
      !activeOrganisation
    ) {
      navigate("/home", { replace: true });
    }
  }, [
    activeOrganisation,
    navigate,
    navigation.routeContext,
    favouritesCatalogueReady,
  ]);

  const handleLogout = async () => {
    await onLogout?.();
    navigate("/login", { replace: true });
  };

  return (
    <OrganisationAccessProvider>
      <div
        className={`authenticated-layout ${navigation.compactLayout || !navigation.hoverCapable ? "authenticated-layout--compact" : ""}`}
        data-testid="authenticated-app-shell"
      >
        <AuthenticatedNavigationPod
          organisations={organisations}
          navigation={navigation}
          onLogout={handleLogout}
        />
        <main className="authenticated-layout__main vrm-main">
          <div className="authenticated-layout__content vrm-content">
            <Suspense
              fallback={
                <div className="vrm-content-loading" role="status">
                  Loading…
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </OrganisationAccessProvider>
  );
}
