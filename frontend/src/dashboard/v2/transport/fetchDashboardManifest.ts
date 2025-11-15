import { API_BASE_URL } from "../../../config";
import { createAbortSignal } from "../../../common/utils/abort";
import { logError, logInfo, logWarn } from "../../../common/utils/logger";
import type { DashboardManifest } from "../types";

export interface FetchDashboardManifestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
};

const sanitizeErrorDetail = (detail?: string | null): string => {
  if (!detail) {
    return "";
  }
  if (detail.toLowerCase().includes("api or static route not found")) {
    return "";
  }
  return detail.trim();
};

const buildManifestErrorMessage = (status: number, detail?: string | null): string => {
  const sanitized = sanitizeErrorDetail(detail);
  if (status === 404) {
    return "Dashboard manifest not found for this organisation (status 404).";
  }
  if (status >= 500) {
    return sanitized
      ? `Server error while loading dashboard manifest (status ${status}). ${sanitized}`
      : `Server error while loading dashboard manifest (status ${status}).`;
  }
  return sanitized
    ? `Failed to load dashboard manifest (status ${status}). ${sanitized}`
    : `Failed to load dashboard manifest (status ${status}).`;
};

export async function fetchDashboardManifest(
  orgId: string,
  dashboardId = "dashboard-default",
  options: FetchDashboardManifestOptions = {},
): Promise<DashboardManifest> {
  const { signal, cleanup } = createAbortSignal({ parent: options.signal, timeoutMs: options.timeoutMs ?? 15000 });
  const url = `${API_BASE_URL}/api/dashboards/${dashboardId}?orgId=${encodeURIComponent(orgId)}`;

  logInfo("dashboard.manifest", "fetch_start", { orgId, dashboardId });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const message = buildManifestErrorMessage(response.status, text);
      logError("dashboard.manifest", "fetch_failed", {
        orgId,
        dashboardId,
        status: response.status,
        body: text,
      });
      throw new Error(message);
    }

    const payload = (await response.json()) as DashboardManifest;
    logInfo("dashboard.manifest", "fetch_success", { orgId, dashboardId });
    return payload;
  } catch (error) {
    if (isAbortError(error)) {
      logWarn("dashboard.manifest", "fetch_aborted", { orgId, dashboardId });
    } else {
      logError("dashboard.manifest", "fetch_error", {
        orgId,
        dashboardId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  } finally {
    cleanup();
  }
}
