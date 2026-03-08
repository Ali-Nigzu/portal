import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import {
  consumeDemoTimeRangeOverride,
  isDemoSessionActive,
} from "../../../lib/demoSession";
import { determineOrgId } from "../../../lib/org";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import { logError, logInfo } from "../../../common/utils/logger";
import type { DashboardManifest } from "../types";
import {
  fetchDashboardManifest,
  type FetchDashboardManifestOptions,
} from "../transport/fetchDashboardManifest";
import { applyVRMOverrides } from "../utils/applyVRMOverrides";
import { resolveUiClient } from "../utils/vrmDecorators";

type ManifestLoader = (
  orgId: string | undefined,
  dashboardId?: string,
  options?: FetchDashboardManifestOptions,
) => Promise<DashboardManifest>;

type UseDashboardManifestParams = {
  credentials: Credentials;
  manifestLoader?: ManifestLoader;
  dashboardId?: string;
  orgIdOverride?: string;
};

type UseDashboardManifestResult = {
  manifest: DashboardManifest | null;
  setManifest: (manifest: DashboardManifest | null) => void;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  selectedTimeRangeId: string | null;
  selectedTimeRange: DashboardTimeRangeOption | null;
  orgId: string | undefined;
  viewToken: string | null;
  resolvedDashboardId: string;
  resolvedUiClient: string | undefined;
};

type DashboardTimeRangeOption = NonNullable<
  DashboardManifest["timeControls"]
>["options"][number];

export const useDashboardManifest = ({
  credentials,
  manifestLoader,
  dashboardId,
  orgIdOverride,
}: UseDashboardManifestParams): UseDashboardManifestResult => {
  const viewToken = useMemo(() => getViewTokenFromLocation(), []);
  const isDemoSession = useMemo(() => isDemoSessionActive(), []);
  const demoTimeRangeOverrideRef = useRef(consumeDemoTimeRangeOverride());
  const orgId = orgIdOverride
    ?? (viewToken || isDemoSession ? undefined : determineOrgId(credentials));
  const resolvedDashboardId = dashboardId ?? "dashboard-default";
  const manifestLoaderImpl = manifestLoader ?? fetchDashboardManifest;
  const [manifest, setManifest] = useState<DashboardManifest | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeRangeId, setSelectedTimeRangeId] = useState<string | null>(
    null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  const resolvedUiClient = useMemo(() => {
    const candidates = [
      manifest?.orgId,
      orgId,
      credentials.orgId,
      credentials.username,
    ];
    for (const candidate of candidates) {
      const resolved = resolveUiClient(candidate);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }, [credentials.orgId, credentials.username, manifest?.orgId, orgId]);

  const loadManifest = useCallback(async () => {
    setStatus("loading");
    setError(null);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    logInfo("dashboard.manifest", "ui_fetch_start", {
      orgId,
      viewToken,
      dashboardId: resolvedDashboardId,
    });
    try {
      const data = await manifestLoaderImpl(orgId, resolvedDashboardId, {
        signal: controller.signal,
        viewToken,
      });
      if (controller.signal.aborted) {
        return;
      }
      const vrmManifest = applyVRMOverrides(data);
      logInfo("dashboard.manifest", "ui_fetch_success", {
        orgId,
        viewToken,
        dashboardId: resolvedDashboardId,
      });
      setManifest(vrmManifest);
      setStatus("ready");
    } catch (err) {
      if (controller.signal.aborted) {
        logInfo("dashboard.manifest", "ui_fetch_aborted", {
          orgId,
          viewToken,
          dashboardId: resolvedDashboardId,
        });
        return;
      }
      const message =
        err instanceof Error ? err.message : "Unable to load dashboard";
      logError("dashboard.manifest", "ui_fetch_error", {
        orgId,
        viewToken,
        dashboardId: resolvedDashboardId,
        message,
      });
      setManifest(null);
      setError(message);
      setStatus("error");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [manifestLoaderImpl, orgId, resolvedDashboardId, viewToken]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    if (!manifest) {
      setSelectedTimeRangeId(null);
      return;
    }
    const options = manifest.timeControls?.options ?? [];
    const fallback =
      manifest.timeControls?.defaultTimeRangeId ?? options[0]?.id ?? null;
    const demoOverride = demoTimeRangeOverrideRef.current;
    if (demoOverride && options.some((option) => option.id === demoOverride)) {
      demoTimeRangeOverrideRef.current = null;
      setSelectedTimeRangeId(demoOverride);
      return;
    }
    setSelectedTimeRangeId((current) => {
      if (current && options.some((option) => option.id === current)) {
        return current;
      }
      return fallback;
    });
  }, [manifest]);

  const selectedTimeRange = useMemo(() => {
    if (!manifest || !selectedTimeRangeId) {
      return null;
    }
    return (
      manifest.timeControls?.options?.find(
        (option) => option.id === selectedTimeRangeId,
      ) ?? null
    );
  }, [manifest, selectedTimeRangeId]);

  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }
    logInfo("dashboard.vrm", "vrm_context_resolved", {
      orgId,
      viewToken: Boolean(viewToken),
      manifestOrgId: manifest?.orgId,
      resolvedUiClient,
    });
  }, [manifest?.orgId, orgId, resolvedUiClient, viewToken]);

  return {
    manifest,
    setManifest,
    status,
    error,
    selectedTimeRangeId,
    selectedTimeRange,
    orgId,
    viewToken,
    resolvedDashboardId,
    resolvedUiClient,
  };
};
