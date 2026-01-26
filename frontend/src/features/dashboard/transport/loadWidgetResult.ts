import { API_BASE_URL } from "../../../config";
import { logError, logInfo, logWarn } from "../../../common/utils/logger";
import type { ChartResult } from "../../../analytics/schemas/charting";
import { validateChartResult } from "../../../analytics/components/ChartRenderer/validation";
import type { DashboardWidget, DashboardTimeRangeOption } from "../types";
import {
  buildSnapshotWidgetResult,
  type SnapshotResponse,
} from "../utils/snapshotPayload";
import type { SiteFlowTimeframe } from "../utils/siteFlowTimeframe";
export interface LoadWidgetOptions {
  signal?: AbortSignal;
  timeRange?: DashboardTimeRangeOption;
  timezone?: string;
  orgId?: string;
  viewToken?: string;
  snapshotTimeframe?: SiteFlowTimeframe;
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
}): Promise<SnapshotResponse> {
  const params = new URLSearchParams();
  if (options.viewToken) {
    params.append("viewToken", options.viewToken);
  } else if (options.orgId) {
    params.append("org", options.orgId);
  } else {
    throw new Error("orgId or viewToken is required to load snapshots");
  }
  const response = await fetch(
    `${API_BASE_URL}${SNAPSHOT_ENDPOINT}?${params.toString()}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
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
  const { signal, orgId, viewToken } = options;
  const snapshotTimeframe = options.snapshotTimeframe ?? "all_time";
  let result: ChartResult;
  logInfo("dashboard.widgets", "load_start", {
    widgetId: widget.id,
    mode: "snapshots",
  });
  try {
    const snapshot = await loadSnapshotPayload({ signal, orgId, viewToken });
    result = buildSnapshotWidgetResult(widget.id, snapshot, snapshotTimeframe);
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
  if (!import.meta.env.PROD && widget.id === "kpi-vrm-traffic") {
    console.log("[VRM traffic] raw result post-validation", {
      widgetId: widget.id,
      chartType: result.chartType,
      chartStyle: (result as unknown as Record<string, unknown> | undefined)
        ?.chartStyle,
      chartSubType: (result as unknown as Record<string, unknown> | undefined)
        ?.chartSubType,
      summaryChartStyle: (
        result.meta?.summary as Record<string, unknown> | undefined
      )?.chartStyle,
      summaryChartSubType: (
        result.meta?.summary as Record<string, unknown> | undefined
      )?.chartSubType,
      seriesCount: result.series?.length,
      xDimension: result.xDimension,
      firstSeriesSample: result.series?.[0]?.data?.slice(0, 5),
      metaSummary: result.meta?.summary,
    });
  }
  logInfo("dashboard.widgets", "load_success", {
    widgetId: widget.id,
    mode: "snapshots",
  });
  return result;
}
