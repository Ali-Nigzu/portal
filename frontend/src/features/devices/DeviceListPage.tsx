import { useOptionalPortal } from "../../context/PortalContext";
import CanonicalDeviceList from "./CanonicalDeviceList";
import type { Credentials } from "../../types/credentials";

export default function DeviceListPage(_props: { credentials?: Credentials }) {
  return useOptionalPortal() ? (
    <CanonicalDeviceList />
  ) : (
    <div role="alert">An authorised Portal context is required.</div>
  );
}
