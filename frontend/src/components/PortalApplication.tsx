import { usePortal } from "../context/PortalContext";
import VRMLayout from "./VRMLayout";
import PortalModuleContent from "./PortalModuleContent";
// Demo retains its own shell; authenticated routes render PortalModuleContent in the app shell.
export default function PortalApplication({ module }: {
  module: string;
}) {
  const { context, selection } = usePortal();
  if (!context) return null;
  if (!selection) return <div role="alert">Portal page not found.</div>;
  const organisation = {
    id: encodeURIComponent(context.organisation.slug),
    label: context.organisation.name,
  };
  const sites = context.sites.map((s) => ({
    id: `${organisation.id}/${encodeURIComponent(s.slug)}`,
    label: s.name,
  }));
  const site =
    selection.scope === "site"
      ? context.sites.find((s) => s.id === selection.id)
      : undefined;
  const selectedKey = site
    ? `${organisation.id}/${encodeURIComponent(site.slug)}`
    : organisation.id;
  return (
    <VRMLayout
      dashboardNavigation={{
        organisation,
        sites,
        selectedKey,
        selectedLabel: site?.name ?? organisation.label,
      }}
    >
      <PortalModuleContent module={module} />
    </VRMLayout>
  );
}
