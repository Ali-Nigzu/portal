import { API_BASE_URL } from "../../config";
import type { DashboardSource, SelectedSnapshot } from "./types";

async function get(path: string, signal: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/api/demo/dashboard${path}`, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "Dashboard data not found." : "Dashboard is temporarily unavailable. Please retry.");
  }
  return response.json();
}

export function parseSnapshot(value: unknown): SelectedSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Snapshot data is invalid.");
  }
  const snapshot = value as Partial<SelectedSnapshot>;
  if ((snapshot.scope !== "organisation" && snapshot.scope !== "site")
    || typeof snapshot.entity_id !== "string" || typeof snapshot.entity_name !== "string"
    || typeof snapshot.ts !== "string" || !snapshot.payload
    || typeof snapshot.payload !== "object" || Array.isArray(snapshot.payload)) {
    throw new Error("Snapshot data is invalid.");
  }
  return snapshot as SelectedSnapshot;
}

export const demoDashboardSource: DashboardSource = {
  context: signal => get("/context", signal),
  snapshot: async (selection, signal) => parseSnapshot(await get(
    selection.scope === "organisation" ? "/snapshot" : `/sites/${encodeURIComponent(selection.id)}/snapshot`, signal,
  )),
};
