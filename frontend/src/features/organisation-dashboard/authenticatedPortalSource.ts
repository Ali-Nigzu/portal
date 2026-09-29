import { API_BASE_URL } from "../../config";
import { responseJson, type PortalDeviceControl, type PortalSource } from "../../context/PortalContext";
import { parseSnapshot } from "./api";

export function authenticatedPortalSource(organisationId: string): PortalSource {
  const base = `${API_BASE_URL}/api/portal/organisations/${encodeURIComponent(organisationId)}`;
  const request: PortalSource["request"] = (path, input, signal) => {
    const params = new URLSearchParams(input);
    params.delete("effective_now");
    return fetch(`${base}${path}${params.size ? `?${params}` : ""}`, {
      signal, cache: "no-store", credentials: "include",
    });
  };
  const deviceControl: PortalDeviceControl = {
    mode: "canonical",
    getOverrides: () => ({}),
    async setSourceEnabled(ref, enabled, signal) {
      const match = /^(device|gateway):([1-9][0-9]*)$/.exec(ref);
      if (!match) throw new Error("Invalid source identity.");
      const path = match[1] === "device"
        ? `/devices/${encodeURIComponent(match[2])}/enabled`
        : `/gateways/by-site/${encodeURIComponent(match[2])}/enabled`;
      const response = await fetch(`${base}${path}`, {
        method: "PUT", signal, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = await responseJson(response);
      return { ref: body.source.ref as string, enabled: body.source.canonical_enabled as boolean };
    },
  };
  return {
    context: async (signal) => responseJson(await request("/context", new URLSearchParams(), signal)),
    snapshot: async (selection, signal) => {
      const path = selection.scope === "organisation"
        ? "/snapshot"
        : `/sites/${encodeURIComponent(selection.id)}/snapshot`;
      return parseSnapshot(await responseJson(await request(path, new URLSearchParams(), signal)));
    },
    request,
    deviceControl,
  };
}
