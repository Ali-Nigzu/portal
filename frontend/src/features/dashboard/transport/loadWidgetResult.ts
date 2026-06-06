import { API_BASE_URL } from "../../../config";
import { logError, logInfo, logWarn } from "../../../common/utils/logger";
import type { ChartResult } from "../../../analytics/schemas/charting";
import { validateChartResult } from "../../../analytics/components/ChartRenderer/validation";
import type { DashboardWidget, DashboardTimeRangeOption } from "../types";
import { buildSnapshotWidgetResult } from "../utils/snapshotPayload";
import type { SnapshotResponse } from "../../../lib/snapshots";
import type { SiteFlowTimeframe } from "../../../lib/siteFlowTimeframe";
import type { SiteView } from "../../../lib/siteView";

export type DashboardDataMode = "authenticated" | "demo" | "view_token" | "public_preview";

export interface LoadWidgetOptions {
  signal?: AbortSignal;
  timeRange?: DashboardTimeRangeOption;
  timezone?: string;
  orgId?: string;
  viewToken?: string;
  snapshotTimeframe?: SiteFlowTimeframe;
  dataMode?: DashboardDataMode;
  siteView?: SiteView;
}

const SNAPSHOT_ENDPOINT = "/api/snapshots/latest";

export const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
};

async function loadSnapshotPayload(options: {
  signal?: AbortSignal;
  orgId?: string;
  viewToken?: string;
  dataMode: DashboardDataMode;
  siteView?: string | null;
}): Promise<SnapshotResponse> {
  const params = new URLSearchParams();
  if (options.siteView) {
    params.append("siteView", options.siteView);
  }
  if (options.viewToken) {
    params.append("viewToken", options.viewToken);
  } else if (options.dataMode !== "demo" && options.orgId) {
    params.append("org", options.orgId);
  } else if (options.dataMode !== "demo") {
    throw new Error("orgId or viewToken is required to load snapshots");
  }

  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}${SNAPSHOT_ENDPOINT}${query ? `?${query}` : ""}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: options.dataMode === "demo" ? "include" : "same-origin",
      signal: options.signal,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Snapshot fetch failed: ${response.status} ${text}`);
  }

  return (await response.json()) as SnapshotResponse;
}

export async function loadWidgetResult(
  widget: DashboardWidget,
  options: LoadWidgetOptions = {},
): Promise<ChartResult> {
  const { signal, orgId, viewToken, dataMode = "demo", siteView } = options;
  const snapshotTimeframe = options.snapshotTimeframe ?? "all_time";
  let result: ChartResult;

  logInfo("dashboard.widgets", "load_start", {
    widgetId: widget.id,
    mode: "snapshots",
    dataMode,
  });

  try {
    const snapshot = await loadSnapshotPayload({
      signal,
      orgId,
      viewToken,
      dataMode,
      siteView,
    });
    result = buildSnapshotWidgetResult(
      widget.id,
      snapshot,
      snapshotTimeframe,
      siteView ?? "site-b",
    );
  } catch (error) {
    if (isAbortError(error)) {
      const code = (error as { code?: string }).code;
      logWarn("dashboard.widgets", "load_aborted", {
        widgetId: widget.id,
        code,
      });
    } else {
      logError("dashboard.widgets", "load_error", {
        widgetId: widget.id,
        mode: "snapshots",
        dataMode,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const validationIssues = validateChartResult(result);
  if (validationIssues.length > 0) {
    const issues = validationIssues.map((issue) => issue.message).join(", ");
    const error = new Error(`Chart result failed validation: ${issues}`);
    logError("dashboard.widgets", "validation_error", {
      widgetId: widget.id,
      issues,
    });
    throw error;
  }

  logInfo("dashboard.widgets", "load_success", {
    widgetId: widget.id,
    mode: "snapshots",
    dataMode,
  });
  return result;
}
