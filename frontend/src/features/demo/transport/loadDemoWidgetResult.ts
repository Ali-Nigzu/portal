import type { ChartResult } from "../../../analytics/schemas/charting";
import { validateChartResult } from "../../../analytics/components/ChartRenderer/validation";
import type { DashboardWidget } from "../../dashboard/types";
import { buildSnapshotWidgetResult } from "../../dashboard/utils/snapshotPayload";
import type { SnapshotResponse } from "../../../lib/snapshots";
import type { SiteFlowTimeframe } from "../../../lib/siteFlowTimeframe";

export interface LoadDemoWidgetOptions {
  signal?: AbortSignal;
  snapshotTimeframe?: SiteFlowTimeframe;
}

const SNAPSHOT_ENDPOINT = "/api/demo/snapshots/latest";

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
};

async function loadDemoSnapshotPayload(options: {
  signal?: AbortSignal;
}): Promise<SnapshotResponse> {
  const response = await fetch(SNAPSHOT_ENDPOINT, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Demo snapshot fetch failed: ${response.status} ${text}`);
  }
  return (await response.json()) as SnapshotResponse;
}

export async function loadDemoWidgetResult(
  widget: DashboardWidget,
  options: LoadDemoWidgetOptions = {},
): Promise<ChartResult> {
  const snapshotTimeframe = options.snapshotTimeframe ?? "all_time";
  const snapshot = await loadDemoSnapshotPayload({ signal: options.signal });
  const result = buildSnapshotWidgetResult(widget.id, snapshot, snapshotTimeframe);

  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const validationIssues = validateChartResult(result);
  if (validationIssues.length > 0) {
    const issues = validationIssues.map((issue) => issue.message).join(", ");
    throw new Error(`Chart result failed validation: ${issues}`);
  }

  return result;
}

export { isAbortError };
