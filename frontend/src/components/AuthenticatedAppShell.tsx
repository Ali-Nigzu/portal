import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { useAuthenticatedApplication } from "../context/AuthenticatedApplicationContext";
import VRMLayout from "./VRMLayout";
import { OrganisationAccessProvider } from "../features/organisation-access/OrganisationAccessContext";

export default function AuthenticatedAppShell({ onLogout }: { onLogout: () => void }) {
  const { organisations } = useAuthenticatedApplication();
  return (
    <OrganisationAccessProvider><VRMLayout
      isAuthenticated
      onLogout={onLogout}
      authenticatedApplication={{ organisations }}
    >
      <Suspense fallback={<div className="vrm-content-loading" role="status">Loading…</div>}>
        <Outlet />
      </Suspense>
    </VRMLayout></OrganisationAccessProvider>
  );
}
