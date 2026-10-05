import { useEffect, useMemo, type ReactNode } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { logout } from "../features/auth/transport/me";
import type { AuthenticatedOrganisation } from "../features/auth/transport/organisations";
import AuthenticatedNavigationPod from "./authenticated-navigation/AuthenticatedNavigationPod";
import { useAuthenticatedNavigation } from "./authenticated-navigation/useAuthenticatedNavigation";
import "../styles/VRMTheme.css";
import "../styles/AuthenticatedNavigation.css";

export default function AuthenticatedVRMLayout({
  organisations,
  onLogout,
  children,
}: {
  organisations: AuthenticatedOrganisation[];
  onLogout?: () => void;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const navigation = useAuthenticatedNavigation(organisations);
  const activeOrganisation = useMemo(
    () => navigation.routeContext.area === "portal"
      ? organisations.find((organisation) => organisation.id === navigation.routeContext.organisationId)
      : undefined,
    [navigation.routeContext, organisations],
  );

  useEffect(() => {
    if (navigation.routeContext.area === "portal" && !activeOrganisation) {
      navigate("/home", { replace: true });
    }
  }, [activeOrganisation, navigate, navigation.routeContext]);

  const handleLogout = async () => {
    await logout();
    onLogout?.();
    navigate("/login", { replace: true });
  };

  return (
    <div
      className={`authenticated-layout ${navigation.compactLayout || !navigation.hoverCapable ? "authenticated-layout--compact" : ""}`}
      data-testid="authenticated-app-shell"
    >
      <AuthenticatedNavigationPod organisations={organisations} navigation={navigation} onLogout={handleLogout} />
      <main className="authenticated-layout__main vrm-main">
        <div className="authenticated-layout__content vrm-content">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
