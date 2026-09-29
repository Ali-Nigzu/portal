import { API_BASE_URL } from "../../config";
import { responseJson, type PortalSource } from "../../context/PortalContext";
import { demoDashboardSource } from "./api";
import { demoDeviceControl } from "../../lib/demoDeviceControls";
const request: PortalSource["request"] = (path, params, signal) =>
  fetch(
    `${API_BASE_URL}/api/demo/portal${path}${params.size ? `?${params}` : ""}`,
    { signal, cache: "no-store", credentials: "include" },
  );
export const demoPortalSource: PortalSource = {
  context: async (signal) =>
    responseJson(await request("/context", new URLSearchParams(), signal)),
  snapshot: demoDashboardSource.snapshot,
  request,
  deviceControl: demoDeviceControl,
};
