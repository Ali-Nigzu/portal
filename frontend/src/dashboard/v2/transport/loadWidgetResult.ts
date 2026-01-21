import { API_BASE_URL, ANALYTICS_V2_TRANSPORT, type AnalyticsTransportMode } from "../../../config";
import { logError, logInfo, logWarn } from "../../../common/utils/logger";
import type { ChartResult } from "../../../analytics/schemas/charting";
import { validateChartResult } from "../../../analytics/components/ChartRenderer/validation";
import { loadChartFixture, type ChartFixtureName } from "../../../analytics/utils/loadChartFixture";
import type { DashboardWidget, DashboardTimeRangeOption } from "../types";
import { buildWidgetSpec } from "../utils/buildWidgetSpec";
import { isSnapshotOrg } from "../utils/snapshotMode";
import { buildSnapshotWidgetResult, type SnapshotResponse } from "../utils/snapshotPayload";
import type { SiteFlowTimeframe } from "../utils/siteFlowTimeframe";

// DEBUG MAP (temporary)
// - Site Flow widget transport: frontend/src/dashboard/v2/transport/loadWidgetResult.ts
// - Live Flow spec source: backend/app/analytics/dashboard_catalogue.py:~190
// - Demographics donuts components: frontend/src/dashboard/v2/widgets/DemographicsWidget.tsx
// - Chart validation: frontend/src/analytics/components/ChartRenderer/validation.ts

export interface LoadWidgetOptions {
  signal?: AbortSignal;
  mode?: AnalyticsTransportMode;
  timeRange?: DashboardTimeRangeOption;
  timezone?: string;
  orgId?: string;
  viewToken?: string;
  snapshotTimeframe?: SiteFlowTimeframe;
}

const DASHBOARD_RUN_ENDPOINT = "/api/analytics/run";
const SNAPSHOT_ENDPOINT = "/api/snapshots/latest";
const MIN_ANALYTICS_TIMEOUT_MS = 3_600_000; // 1 hour safeguard to align with backend allowance

const envAnalyticsTimeoutMs = Number(process.env.REACT_APP_DASHBOARD_ANALYTICS_TIMEOUT_MS);

const DASHBOARD_ANALYTICS_TIMEOUT_MS =
  Number.isFinite(envAnalyticsTimeoutMs) && envAnalyticsTimeoutMs >= MIN_ANALYTICS_TIMEOUT_MS
    ? envAnalyticsTimeoutMs
    : MIN_ANALYTICS_TIMEOUT_MS;

export const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
};

async function loadSnapshotPayload(
  options: { signal?: AbortSignal; orgId?: string; viewToken?: string },
): Promise<SnapshotResponse> {
  const params = new URLSearchParams();
  if (options.viewToken) {
    params.append("viewToken", options.viewToken);
  } else if (options.orgId) {
    params.append("org", options.orgId);
  } else {
    throw new Error("orgId or viewToken is required to load snapshots");
  }

  const response = await fetch(`${API_BASE_URL}${SNAPSHOT_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Snapshot fetch failed: ${response.status} ${text}`);
  }

  return (await response.json()) as SnapshotResponse;
}

async function runLiveQuery(
  body: unknown,
  options: { signal?: AbortSignal; widgetId?: string; orgId?: string; timeoutMs?: number } = {},
): Promise<ChartResult> {
  const { signal, widgetId, orgId, timeoutMs = DASHBOARD_ANALYTICS_TIMEOUT_MS } = options;
  const start = Date.now();
  let abortedByTimeout = false;
  const parentSignal = signal;

  const controller = new AbortController();
  const handleParentAbort = () => {
    controller.abort(parentSignal?.reason ?? new DOMException("Aborted", "AbortError"));
  };
  if (parentSignal) {
    if (parentSignal.aborted) {
      handleParentAbort();
    } else {
      parentSignal.addEventListener("abort", handleParentAbort);
    }
  }

  const timeoutId = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort(new DOMException("Timeout", "AbortError"));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", handleParentAbort);
    }
  };

  const requestSignal = controller.signal;

  try {
    const response = await fetch(`${API_BASE_URL}${DASHBOARD_RUN_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: requestSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Analytics run failed: ${response.status} ${text}`);
    }

    logInfo("dashboard.widgets", "live_query_success", {
      widgetId,
      orgId,
      durationMs: Date.now() - start,
      timeoutMs,
    });

    return (await response.json()) as ChartResult;
  } catch (error) {
    const durationMs = Date.now() - start;
    if (isAbortError(error)) {
      const code = abortedByTimeout ? "TIMEOUT" : "ABORTED";
      const reason = requestSignal.reason;
      logWarn("dashboard.widgets", "live_query_aborted", {
        widgetId,
        orgId,
        durationMs,
        timeoutMs,
        code,
        reason: reason instanceof Error ? reason.message : String(reason ?? ""),
      });
      const abortError = new Error(
        abortedByTimeout ? "Analytics request timed out" : "Analytics request was cancelled",
      );
      abortError.name = "AbortError";
      (abortError as { code?: string }).code = code;
      throw abortError;
    }
    logError("dashboard.widgets", "live_query_error", {
      widgetId,
      orgId,
      durationMs,
      timeoutMs,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    cleanup();
  }
}

function resolveMode(widget: DashboardWidget, requested?: AnalyticsTransportMode): AnalyticsTransportMode {
  const mode = requested ?? ANALYTICS_V2_TRANSPORT;
  if (mode === "fixtures" && !widget.fixtureId) {
    return "live";
  }
  return mode;
}

export async function loadWidgetResult(
  widget: DashboardWidget,
  options: LoadWidgetOptions = {},
): Promise<ChartResult> {
  const { signal, timeRange, timezone, mode, orgId, viewToken } = options;
  const spec = buildWidgetSpec(widget, { timeRange, timezone });
  const selectedMode = resolveMode(widget, mode);
  const snapshotTimeframe = options.snapshotTimeframe ?? "all_time";
  const shouldUseSnapshots =
    selectedMode === "live" && (Boolean(viewToken) || isSnapshotOrg(orgId));

  let result: ChartResult;
  logInfo("dashboard.widgets", "load_start", {
    widgetId: widget.id,
    mode: selectedMode,
    timeRange: timeRange?.id,
  });

  try {
    if (selectedMode === "fixtures") {
      if (!widget.fixtureId) {
        throw new Error(`Widget ${widget.id} is missing a fixture mapping`);
      }
      result = await loadChartFixture(widget.fixtureId as ChartFixtureName);
    } else if (shouldUseSnapshots) {
      const snapshot = await loadSnapshotPayload({ signal, orgId, viewToken });
      result = buildSnapshotWidgetResult(widget.id, snapshot, snapshotTimeframe);
    } else {
      const payload = viewToken ? { spec, viewToken } : { spec, orgId };
      result = await runLiveQuery(payload, {
        signal,
        widgetId: widget.id,
        orgId,
        timeoutMs: DASHBOARD_ANALYTICS_TIMEOUT_MS,
      });
    }
  } catch (error) {
    if (isAbortError(error)) {
      const code = (error as { code?: string }).code;
      logWarn("dashboard.widgets", "load_aborted", { widgetId: widget.id, code });
    } else {
      logError("dashboard.widgets", "load_error", {
        widgetId: widget.id,
        mode: selectedMode,
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

  if (process.env.NODE_ENV !== "production" && widget.id === "kpi-vrm-traffic") {
    // eslint-disable-next-line no-console
    console.log("[VRM traffic] raw result post-validation", {
      widgetId: widget.id,
      chartType: result.chartType,
      chartStyle: (result as unknown as Record<string, unknown> | undefined)?.chartStyle,
      chartSubType: (result as unknown as Record<string, unknown> | undefined)?.chartSubType,
      summaryChartStyle: (result.meta?.summary as Record<string, unknown> | undefined)?.chartStyle,
      summaryChartSubType: (result.meta?.summary as Record<string, unknown> | undefined)?.chartSubType,
      seriesCount: result.series?.length,
      xDimension: result.xDimension,
      firstSeriesSample: result.series?.[0]?.data?.slice(0, 5),
      metaSummary: result.meta?.summary,
    });
  }

  logInfo("dashboard.widgets", "load_success", { widgetId: widget.id, mode: selectedMode });
  return result;
}
