import { API_BASE_URL } from "../../../config";
import { createAbortSignal } from "../../../common/utils/abort";
import { logError, logInfo, logWarn } from "../../../common/utils/logger";
import type { DashboardManifest, DashboardWidget } from "../types";

export interface PinWidgetRequest {
  widget: DashboardWidget;
  position?: "start" | "end";
  targetBand?: "kpiBand" | "grid";
}

export interface DashboardMutationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
};

export async function pinDashboardWidget(
  orgId: string,
  dashboardId: string,
  payload: PinWidgetRequest,
  options: DashboardMutationOptions = {},
): Promise<DashboardManifest> {
  const { signal, cleanup } = createAbortSignal({ parent: options.signal, timeoutMs: options.timeoutMs ?? 15000 });
  const url = `${API_BASE_URL}/api/dashboards/${dashboardId}/widgets?orgId=${encodeURIComponent(orgId)}`;
  const widgetId = payload.widget?.id;

  logInfo("dashboard.manifest", "pin_start", { orgId, dashboardId, widgetId });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      logError("dashboard.manifest", "pin_failed", {
        orgId,
        dashboardId,
        widgetId,
        status: response.status,
        body: text,
      });
      throw new Error(`Failed to pin widget: ${response.status} ${text}`);
    }

    const manifest = (await response.json()) as DashboardManifest;
    logInfo("dashboard.manifest", "pin_success", { orgId, dashboardId, widgetId });
    return manifest;
  } catch (error) {
    if (isAbortError(error)) {
      logWarn("dashboard.manifest", "pin_aborted", { orgId, dashboardId, widgetId });
    } else {
      logError("dashboard.manifest", "pin_error", {
        orgId,
        dashboardId,
        widgetId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  } finally {
    cleanup();
  }
}

export async function unpinDashboardWidget(
  orgId: string,
  dashboardId: string,
  widgetId: string,
  options: DashboardMutationOptions = {},
): Promise<DashboardManifest> {
  const { signal, cleanup } = createAbortSignal({ parent: options.signal, timeoutMs: options.timeoutMs ?? 15000 });
  const url = `${API_BASE_URL}/api/dashboards/${dashboardId}/widgets/${encodeURIComponent(widgetId)}?orgId=${encodeURIComponent(orgId)}`;

  logInfo("dashboard.manifest", "unpin_start", { orgId, dashboardId, widgetId });

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      logError("dashboard.manifest", "unpin_failed", {
        orgId,
        dashboardId,
        widgetId,
        status: response.status,
        body: text,
      });
      throw new Error(`Failed to remove widget: ${response.status} ${text}`);
    }

    const manifest = (await response.json()) as DashboardManifest;
    logInfo("dashboard.manifest", "unpin_success", { orgId, dashboardId, widgetId });
    return manifest;
  } catch (error) {
    if (isAbortError(error)) {
      logWarn("dashboard.manifest", "unpin_aborted", { orgId, dashboardId, widgetId });
    } else {
      logError("dashboard.manifest", "unpin_error", {
        orgId,
        dashboardId,
        widgetId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  } finally {
    cleanup();
  }
}
