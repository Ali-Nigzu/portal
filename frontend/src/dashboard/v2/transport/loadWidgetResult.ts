import { API_BASE_URL, ANALYTICS_V2_TRANSPORT, type AnalyticsTransportMode } from "../../../config";
import { createAbortSignal } from "../../../common/utils/abort";
import { logError, logInfo, logWarn } from "../../../common/utils/logger";
import type { ChartResult } from "../../../analytics/schemas/charting";
import { validateChartResult } from "../../../analytics/components/ChartRenderer/validation";
import { loadChartFixture, type ChartFixtureName } from "../../../analytics/utils/loadChartFixture";
import type { DashboardWidget, DashboardTimeRangeOption } from "../types";
import { buildWidgetSpec } from "../utils/buildWidgetSpec";

export interface LoadWidgetOptions {
  signal?: AbortSignal;
  mode?: AnalyticsTransportMode;
  timeRange?: DashboardTimeRangeOption;
  timezone?: string;
}

const DASHBOARD_RUN_ENDPOINT = "/analytics/run";

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
};

async function runLiveQuery(body: unknown, signal?: AbortSignal): Promise<ChartResult> {
  const { signal: requestSignal, cleanup } = createAbortSignal({ parent: signal, timeoutMs: 20000 });
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

    return (await response.json()) as ChartResult;
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
  const { signal, timeRange, timezone, mode } = options;
  const spec = buildWidgetSpec(widget, { timeRange, timezone });
  const selectedMode = resolveMode(widget, mode);

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
    } else {
      result = await runLiveQuery({ spec }, signal);
    }
  } catch (error) {
    if (isAbortError(error)) {
      logWarn("dashboard.widgets", "load_aborted", { widgetId: widget.id });
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

  logInfo("dashboard.widgets", "load_success", { widgetId: widget.id, mode: selectedMode });
  return result;
}
