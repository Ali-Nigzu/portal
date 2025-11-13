import type { ChartResult, ChartSpec } from "../schemas/charting";

export interface ExportRequest {
  result: ChartResult;
  spec?: ChartSpec | null;
  specHash?: string | null;
}

export interface ExportPayload {
  spec: ChartSpec | null;
  specHash: string | null;
}

export function buildExportPayload({ spec, specHash }: ExportRequest): ExportPayload {
  return {
    spec: spec ?? null,
    specHash: specHash ?? null,
  };
}

export async function triggerExport(request: ExportRequest): Promise<Response | void> {
  const payload = buildExportPayload(request);
  try {
    const response = await fetch("/api/analytics/export-placeholder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.warn("Export placeholder responded with status", response.status);
    }
    return response;
  } catch (error) {
    console.warn("Export placeholder failed", error);
  }
}
