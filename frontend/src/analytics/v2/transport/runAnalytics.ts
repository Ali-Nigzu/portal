import { API_BASE_URL, ANALYTICS_V2_TRANSPORT, type AnalyticsTransportMode } from '../../../config';
import type { ChartResult, ChartSpec } from '../../schemas/charting';
import { validateChartResult } from '../../components/ChartRenderer/validation';
import { loadChartFixture } from '../../utils/loadChartFixture';
import type { PresetDefinition } from '../presets/types';
import { hashChartSpec } from './hashChartSpec';

export type TransportErrorCategory =
  | 'NETWORK'
  | 'INVALID_SPEC'
  | 'INVALID_RESULT'
  | 'PARTIAL_DATA'
  | 'ABORTED';

export class AnalyticsTransportError extends Error {
  category: TransportErrorCategory;
  issues?: ReturnType<typeof validateChartResult>;

  constructor(category: TransportErrorCategory, message: string, issues?: ReturnType<typeof validateChartResult>) {
    super(message);
    this.category = category;
    this.issues = issues;
  }
}

export interface AnalyticsRunDiagnostics {
  partialData: boolean;
}

export interface AnalyticsRunResponse {
  result: ChartResult;
  spec: ChartSpec;
  specHash: string;
  mode: AnalyticsTransportMode;
  diagnostics: AnalyticsRunDiagnostics;
}

export interface RunAnalyticsQueryOptions {
  mode?: AnalyticsTransportMode;
  signal?: AbortSignal;
  orgId?: string;
  viewToken?: string;
  bypassCache?: boolean;
  cacheTtlSeconds?: number;
}

const ANALYTICS_RUN_ENDPOINT = '/api/analytics/run';
const DEV_MAX_RETRIES = process.env.NODE_ENV === 'production' ? 0 : 2;
const BASE_RETRY_DELAY_MS = 250;

const wait = (delay: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeout = setTimeout(resolve, delay);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    }
  });

const isAbortError = (error: unknown): boolean => {
  return error instanceof DOMException && error.name === 'AbortError';
};

async function runLiveQueryOnce(spec: ChartSpec, options: RunAnalyticsQueryOptions): Promise<ChartResult> {
  const response = await fetch(`${API_BASE_URL}${ANALYTICS_RUN_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spec,
      orgId: options.orgId,
      viewToken: options.viewToken,
      bypassCache: options.bypassCache,
      cacheTtlSeconds: options.cacheTtlSeconds,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status >= 400 && response.status < 500) {
      throw new AnalyticsTransportError('INVALID_SPEC', `Analytics run failed: ${response.status} ${text}`);
    }
    throw new AnalyticsTransportError('NETWORK', `Analytics run failed: ${response.status} ${text}`);
  }

  return (await response.json()) as ChartResult;
}

async function runLiveQuery(spec: ChartSpec, options: RunAnalyticsQueryOptions): Promise<ChartResult> {
  let attempt = 0;
  while (true) {
    try {
      return await runLiveQueryOnce(spec, options);
    } catch (error) {
      if (isAbortError(error) || error instanceof AnalyticsTransportError) {
        throw error;
      }
      if (attempt >= DEV_MAX_RETRIES) {
        throw error;
      }
      await wait(BASE_RETRY_DELAY_MS * Math.pow(2, attempt), options.signal);
      attempt += 1;
    }
  }
}

async function runFixtureQuery(preset: PresetDefinition, signal?: AbortSignal): Promise<ChartResult> {
  if (!preset.fixture) {
    throw new AnalyticsTransportError('INVALID_RESULT', `Preset ${preset.id} is missing fixture mapping.`);
  }
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  let result: ChartResult;
  try {
    result = await loadChartFixture(preset.fixture);
  } catch (error) {
    throw new AnalyticsTransportError('INVALID_RESULT', `Fixture failed to load for ${preset.id}: ${(error as Error).message}`);
  }
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return result;
}

const buildDiagnostics = (result: ChartResult): AnalyticsRunDiagnostics => ({
  partialData: Boolean((result.meta as { partialData?: boolean } | undefined)?.partialData),
});

const normalizeError = (error: unknown): AnalyticsTransportError => {
  if (error instanceof AnalyticsTransportError) {
    return error;
  }
  if (isAbortError(error)) {
    return new AnalyticsTransportError('ABORTED', 'Analytics run aborted by user');
  }
  const message = error instanceof Error ? error.message : 'Unknown analytics transport error';
  return new AnalyticsTransportError('NETWORK', message);
};

export async function runAnalyticsQuery(
  preset: PresetDefinition,
  spec: ChartSpec,
  options: RunAnalyticsQueryOptions = {},
): Promise<AnalyticsRunResponse> {
  const specHash = hashChartSpec(spec);
  const selectedMode = options.mode ?? ANALYTICS_V2_TRANSPORT;
  const logContext = { presetId: preset.id, specHash, mode: selectedMode };
  console.info('[analytics:v2] run:start', logContext);
  try {
    const result =
      selectedMode === 'live'
        ? await runLiveQuery(spec, options)
        : await runFixtureQuery(preset, options.signal);

    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const validationIssues = validateChartResult(result);
    if (validationIssues.length > 0) {
      throw new AnalyticsTransportError('INVALID_RESULT', 'Chart result failed validation.', validationIssues);
    }

    const diagnostics = buildDiagnostics(result);

    console.info('[analytics:v2] run:success', { ...logContext, diagnostics });

    return { result, spec, specHash, mode: selectedMode, diagnostics };
  } catch (error) {
    const normalized = normalizeError(error);
    console.error('[analytics:v2] run:error', { ...logContext, category: normalized.category, message: normalized.message });
    throw normalized;
  }
}
