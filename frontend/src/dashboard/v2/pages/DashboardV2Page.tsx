import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../../../analytics/components/Card";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer";
import ErrorBoundary from "../../../common/components/ErrorBoundary";
import { logError, logInfo } from "../../../common/utils/logger";
import HeaderStatusStrip from "../../../components/HeaderStatusStrip";
import type {
  DashboardGridPlacement,
  DashboardManifest,
  DashboardWidget,
  DashboardWidgetState,
} from "../types";
import { fetchDashboardManifest, type FetchDashboardManifestOptions } from "../transport/fetchDashboardManifest";
import {
  loadWidgetResult,
  type LoadWidgetOptions,
  isAbortError,
} from "../transport/loadWidgetResult";
import { unpinDashboardWidget } from "../transport/mutateDashboardManifest";
import { determineOrgId } from "../../../utils/org";
import { getViewTokenFromLocation } from "../../../utils/viewToken";
import { Credentials } from "../../../types/credentials";
import "../styles/DashboardV2Page.css";
import { VRM_KPI_IDS, applyVRMOverrides } from "../utils/applyVRMOverrides";
import {
  decorateResult,
  lastBucketValue,
  resolveUiClient,
} from "../utils/vrmDecorators";
import {
  SiteFlowDemographicsView,
  type SiteFlowDemographicsData,
} from "../components/SiteFlowDemographicsView";
import {
  buildDemographicsWidget,
  isSiteFlowWidget,
  type DemographicWidgetKind,
} from "../utils/siteFlowDemographics";

export { lookupCapacity } from "../utils/vrmDecorators";

const GRID_ROW_HEIGHT = 96;

const formatTitleCase = (value?: string | null) => {
  if (!value) return "Site";
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const deriveSiteDisplayId = (raw?: string | null) => {
  if (!raw) return "—";
  const cleaned = raw.split(".")[0];
  const numericMatch = cleaned.match(/(\d+)/);
  if (numericMatch) {
    return numericMatch[1];
  }
  return cleaned;
};

type ManifestLoader = (
  orgId: string | undefined,
  dashboardId?: string,
  options?: FetchDashboardManifestOptions,
) => Promise<DashboardManifest>;
type WidgetResultLoader = (
  widget: DashboardWidget,
  options?: LoadWidgetOptions,
) => Promise<Parameters<typeof ChartRenderer>[0]["result"]>;
type UnpinMutator = (
  orgId: string,
  dashboardId: string,
  widgetId: string,
) => Promise<DashboardManifest>;

interface DashboardV2PageProps {
  credentials: Credentials;
  manifestLoader?: ManifestLoader;
  widgetResultLoader?: WidgetResultLoader;
  unpinWidget?: UnpinMutator;
  dashboardId?: string;
}

const renderLoading = (label: string) => (
  <div className="dashboard-v2__placeholder" aria-live="polite">
    Loading {label}…
  </div>
);

const renderError = (message: string) => (
  <div className="dashboard-v2__error" role="alert">
    {message}
  </div>
);

const KpiTile = ({
  title,
  result,
  state,
  locked,
  onRemove,
  widgetId,
}: {
  title: string;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  state: DashboardWidgetState;
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
}) => {
  const summary = result?.meta?.summary ?? {};
  const headline = typeof summary.headline === "string" ? summary.headline : null;
  const renderedResult = result
    ? ({
        ...result,
        meta: {
          ...(result.meta ?? { timezone: "UTC" }),
          summary: { ...(result.meta?.summary ?? {}), title },
        },
      } as Parameters<typeof ChartRenderer>[0]["result"])
    : result;

  let content: JSX.Element;
  if (state.status === "loading") {
    content = renderLoading(title);
  } else if (state.status === "error") {
    content = renderError(state.error ?? `Failed to load ${title}`);
  } else if (!result) {
    content = renderError("No data available");
  } else {
    content = (
      <ChartRenderer
        result={renderedResult!}
        height={168}
        className="dashboard-v2__kpi-renderer"
        widgetId={widgetId}
      />
    );
  }

  const showRemove = Boolean(onRemove) && !locked;

  return (
    <div className="dashboard-v2__kpi-tile vrm-kpi-tile vrm-kpi-tile--panel" data-state={state.status}>
      {showRemove ? (
        <div className="dashboard-v2__kpi-controls">
          <button type="button" className="dashboard-v2__remove-button" onClick={onRemove}>
            Unpin
          </button>
        </div>
      ) : null}
      <div className="dashboard-v2__kpi-content" aria-label={title} data-headline={headline ?? undefined}>
        {content}
      </div>
    </div>
  );
};

const ChartCard = ({
  title,
  subtitle,
  state,
  result,
  locked,
  onRemove,
  widgetId,
}: {
  title: string;
  subtitle?: string;
  state: DashboardWidgetState;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
}) => {
  let body: JSX.Element;
  if (state.status === "loading") {
    body = renderLoading(title);
  } else if (state.status === "error") {
    body = renderError(state.error ?? `Failed to load ${title}`);
  } else if (!result) {
    body = renderError("No data available");
  } else {
    body = <ChartRenderer result={result} height={360} widgetId={widgetId} />;
  }

  const footer = !locked && onRemove ? (
    <div className="dashboard-v2__widget-footer">
      <button type="button" className="dashboard-v2__remove-button" onClick={onRemove}>
        Unpin
      </button>
    </div>
  ) : undefined;

  return (
    <Card
      title={title}
      subtitle={subtitle}
      className="dashboard-v2__chart-card vrm-card vrm-card--chart-panel"
      footer={footer}
    >
      {body}
    </Card>
  );
};

const SiteFlowCard = ({
  state,
  result,
  subtitle,
  locked,
  onRemove,
  widgetId,
  mode,
  onModeChange,
  demographics,
}: {
  state: DashboardWidgetState;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  subtitle?: string;
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
  mode: "activity" | "demographics";
  onModeChange: (mode: "activity" | "demographics") => void;
  demographics: { status: "idle" | "loading" | "ready" | "error"; data?: SiteFlowDemographicsData; error?: string };
}) => {
  const renderSiteFlowBody = () => {
    if (mode === "demographics") {
      if (demographics.status === "loading") {
        return renderLoading("Demographics");
      }
      if (demographics.status === "error") {
        return renderError(demographics.error ?? "Failed to load demographics");
      }
      if (demographics.status !== "ready" || !demographics.data) {
        return renderError("No demographics available");
      }
      return <SiteFlowDemographicsView data={demographics.data} />;
    }

    if (state.status === "loading") {
      return renderLoading("Site Flow");
    }
    if (state.status === "error") {
      return renderError(state.error ?? "Failed to load Site Flow");
    }
    if (!result) {
      return renderError("No data available");
    }
    return <ChartRenderer result={result} height={360} widgetId={widgetId} />;
  };

  const footer = !locked && onRemove ? (
    <div className="dashboard-v2__widget-footer">
      <button type="button" className="dashboard-v2__remove-button" onClick={onRemove}>
        Unpin
      </button>
    </div>
  ) : undefined;

  return (
    <Card
      title="Site Flow"
      subtitle={subtitle}
      className="dashboard-v2__chart-card vrm-card vrm-card--chart-panel"
      footer={footer}
      dateSelector={
        <select
          className="vrm-select"
          aria-label="Select Site Flow view"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as "activity" | "demographics")}
        >
          <option value="activity">Activity</option>
          <option value="demographics">Demographics</option>
        </select>
      }
    >
      {renderSiteFlowBody()}
    </Card>
  );
};

const buildGridStyle = (placement?: DashboardGridPlacement) => {
  if (!placement) {
    return undefined;
  }
  return {
    gridColumn: `${placement.x + 1} / span ${Math.max(1, placement.w)}`,
    gridRow: `${placement.y + 1} / span ${Math.max(1, placement.h)}`,
    minHeight: `${Math.max(1, placement.h) * GRID_ROW_HEIGHT}px`,
  };
};

const DashboardV2Page = ({
  credentials,
  manifestLoader,
  widgetResultLoader,
  unpinWidget,
  dashboardId,
}: DashboardV2PageProps) => {
  const viewToken = useMemo(() => getViewTokenFromLocation(), []);
  const orgId = viewToken ? undefined : determineOrgId(credentials);
  const resolvedDashboardId = dashboardId ?? "dashboard-default";
  const manifestLoaderImpl = manifestLoader ?? fetchDashboardManifest;
  const widgetResultLoaderImpl = widgetResultLoader ?? loadWidgetResult;
  const unpinWidgetImpl = unpinWidget ?? unpinDashboardWidget;

  const [manifest, setManifest] = useState<DashboardManifest | null>(null);
  const [widgetState, setWidgetState] = useState<Record<string, DashboardWidgetState>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeRangeId, setSelectedTimeRangeId] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const [localTime, setLocalTime] = useState<Date>(() => new Date());
  const [siteFlowMode, setSiteFlowMode] = useState<"activity" | "demographics">(
    "activity",
  );
  const [siteFlowDemographics, setSiteFlowDemographics] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    data?: SiteFlowDemographicsData;
    error?: string;
  }>({ status: "idle" });
  const abortControllerRef = useRef<AbortController | null>(null);
  const vrmDebugEnabled = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    return params.has("vrmDebug");
  }, []);

  const resolvedUiClient = useMemo(() => {
    const candidates = [manifest?.orgId, orgId, credentials.orgId, credentials.username];
    for (const candidate of candidates) {
      const resolved = resolveUiClient(candidate);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }, [credentials.orgId, credentials.username, manifest?.orgId, orgId]);

  const clientContextId = resolvedUiClient;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    logInfo("dashboard.vrm", "vrm_context_resolved", {
      orgId,
      viewToken: Boolean(viewToken),
      manifestOrgId: manifest?.orgId,
      resolvedUiClient,
    });
  }, [manifest?.orgId, orgId, resolvedUiClient, viewToken]);

  useEffect(() => {
    const interval = setInterval(() => setLocalTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

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
    } catch (err) {
      if (controller.signal.aborted) {
        logInfo("dashboard.manifest", "ui_fetch_aborted", {
          orgId,
          viewToken,
          dashboardId: resolvedDashboardId,
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Unable to load dashboard";
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
      setWidgetState({});
      return;
    }
    setWidgetState((previous) => {
      const next: Record<string, DashboardWidgetState> = {};
      manifest.widgets.forEach((widget) => {
        const prior = previous[widget.id];
        next[widget.id] = prior ? { ...prior, widget } : { widget, status: "idle" };
      });
      return next;
    });
  }, [manifest]);

  useEffect(() => {
    if (!manifest) {
      setSelectedTimeRangeId(null);
      return;
    }
    const options = manifest.timeControls?.options ?? [];
    const fallback = manifest.timeControls?.defaultTimeRangeId ?? options[0]?.id ?? null;
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
      manifest.timeControls?.options?.find((option) => option.id === selectedTimeRangeId) ?? null
    );
  }, [manifest, selectedTimeRangeId]);

  const siteFlowWidget = useMemo(
    () => manifest?.widgets.find((widget) => isSiteFlowWidget(widget)) ?? null,
    [manifest],
  );

  useEffect(() => {
    if (!manifest) {
      return;
    }
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus("loading");
    setError(null);

    setWidgetState((previous) => {
      const next: Record<string, DashboardWidgetState> = {};
      manifest.widgets.forEach((widget) => {
        const prior = previous[widget.id];
        next[widget.id] = {
          widget,
          status: "loading",
          result: prior?.result,
        };
      });
      return next;
    });

    let encounteredError = false;
    const timezone = manifest.timeControls?.timezone;

    const run = async () => {
      await Promise.all(
        manifest.widgets.map(async (widget) => {
          try {
            const result = await widgetResultLoaderImpl(widget, {
              signal: controller.signal,
              timeRange: selectedTimeRange ?? undefined,
              timezone,
              orgId,
              viewToken,
            });
            if (controller.signal.aborted) {
              return;
            }
            if (process.env.NODE_ENV !== "production" && widget.id === VRM_KPI_IDS.traffic) {
              const summary = result.meta?.summary as Record<string, unknown> | undefined;
              // eslint-disable-next-line no-console
              console.log("[VRM] raw widget result", {
                widgetId: widget.id,
                chartType: result.chartType,
                chartStyle: summary?.chartStyle,
                chartSubType: summary?.chartSubType,
                seriesLength: result.series.length,
                firstPoints: result.series[0]?.data?.slice(0, 5)?.map((point) => ({
                  x: point.x,
                  value: point.value ?? point.y,
                })),
              });
            }
            const decorated = decorateResult(widget.id, result, clientContextId);
            setWidgetState((previous) => ({
              ...previous,
              [widget.id]: {
                widget,
                result: decorated,
                status: "ready",
              },
            }));
          } catch (err) {
            if (controller.signal.aborted) {
              return;
            }
            if (isAbortError(err)) {
              const code = (err as { code?: string }).code;
              if (code === "ABORTED") {
                logInfo("dashboard.widgets", "ui_widget_cancelled", { widgetId: widget.id });
                return;
              }
            }
            encounteredError = true;
            const message = err instanceof Error ? err.message : "Unknown widget error";
            logError("dashboard.widgets", "ui_widget_error", {
              widgetId: widget.id,
              message,
            });
            setWidgetState((previous) => ({
              ...previous,
              [widget.id]: {
                widget,
                status: "error",
                error: message,
                result: previous[widget.id]?.result,
              },
            }));
          }
        }),
      );

      if (controller.signal.aborted) {
        return;
      }
      if (encounteredError) {
        setStatus("error");
        setError("Some widgets failed to load");
        logError("dashboard.widgets", "ui_batch_error", {
          manifestId: manifest.id,
          message: "Some widgets failed to load",
        });
      } else {
        setStatus("ready");
        setError(null);
        logInfo("dashboard.widgets", "ui_batch_success", { manifestId: manifest.id });
      }
    };

    run().catch((err) => {
      if (controller.signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : "Unable to load dashboard widgets";
      setError(message);
      setStatus("error");
      logError("dashboard.widgets", "ui_batch_failure", {
        manifestId: manifest?.id,
        message,
      });
    });

    return () => {
      controller.abort();
    };
  }, [
    manifest,
    selectedTimeRange,
    runNonce,
    widgetResultLoaderImpl,
    orgId,
    viewToken,
    clientContextId,
  ]);

  useEffect(() => {
    if (!siteFlowWidget || !manifest || !selectedTimeRange) {
      setSiteFlowDemographics((previous) =>
        previous.status === "idle" ? previous : { status: "idle" },
      );
      return;
    }

    const controller = new AbortController();
    const timezone = manifest.timeControls?.timezone;
    const kinds: DemographicWidgetKind[] = ["age", "gender", "hour", "race"];

    setSiteFlowDemographics({ status: "loading" });

    const loadDemographic = async (kind: DemographicWidgetKind) =>
      widgetResultLoaderImpl(buildDemographicsWidget(kind), {
        signal: controller.signal,
        timeRange: selectedTimeRange ?? undefined,
        timezone,
        orgId,
        viewToken,
      });

    Promise.all(kinds.map((kind) => loadDemographic(kind)))
      .then(([ageResult, genderResult, hourResult, raceResult]) => {
        if (controller.signal.aborted) {
          return;
        }

        const toNumeric = (point: { value?: number | null; y?: number | null }) => {
          const raw = point.value ?? point.y ?? null;
          return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
        };

        const mapLabel = (label: string, kind: DemographicWidgetKind) => {
          const normalized = label.trim();
          if (kind === "age") {
            const ageMap: Record<string, string> = {
              "0": "0–4",
              "1": "5–13",
              "2": "14–25",
              "3": "26–45",
              "4": "46–65",
              "5": "66+",
            };
            return ageMap[normalized] ?? normalized;
          }
          if (kind === "gender") {
            const genderMap: Record<string, string> = {
              "0": "Male",
              "1": "Female",
            };
            return genderMap[normalized] ?? normalized;
          }
          if (kind === "race") {
            const raceMap: Record<string, string> = {
              "0": "Light",
              "1": "Mix",
              "2": "Dark",
            };
            return raceMap[normalized] ?? normalized;
          }
          return normalized;
        };

        const mapSeries = (
          result?: Parameters<typeof ChartRenderer>[0]["result"],
          kind?: DemographicWidgetKind,
        ) => {
          const series = result?.series?.[0];
          if (!series) return [] as Array<{ label: string; value: number }>;
          return (series.data ?? [])
            .map((point) => ({
              label: mapLabel(String(point.x ?? ""), kind ?? "age"),
              value: toNumeric(point),
            }))
            .filter((entry) => entry.label !== "");
        };

        const mapHours = (result?: Parameters<typeof ChartRenderer>[0]["result"]) => {
          const series = result?.series?.[0];
          if (!series) return [] as Array<{ label: string; value: number }>;
          return (series.data ?? [])
            .map((point) => {
              const value = toNumeric(point);
              const rawHour = typeof point.x === "number" ? point.x : Number(point.x ?? null);
              const label = Number.isFinite(rawHour)
                ? `${String(rawHour).padStart(2, "0")}:00`
                : String(point.x ?? "");
              return { label, value };
            })
            .filter((entry) => entry.value > 0 && entry.label !== "");
        };

        const resolvedTimezone =
          ageResult?.meta?.timezone ??
          genderResult?.meta?.timezone ??
          hourResult?.meta?.timezone ??
          raceResult?.meta?.timezone ??
          timezone ??
          "UTC";

        const data: SiteFlowDemographicsData = {
          age: mapSeries(ageResult, "age"),
          gender: mapSeries(genderResult, "gender"),
          race: mapSeries(raceResult, "race"),
          hour: mapHours(hourResult),
          timezone: resolvedTimezone,
        };

        setSiteFlowDemographics({ status: "ready", data });
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load demographics";
        setSiteFlowDemographics({ status: "error", error: message });
      });

    return () => controller.abort();
  }, [
    manifest,
    widgetResultLoaderImpl,
    orgId,
    viewToken,
    selectedTimeRange,
    siteFlowWidget,
    runNonce,
  ]);

  const kpiWidgets = useMemo(() => {
    if (!manifest) {
      return [] as DashboardWidgetState[];
    }
    return manifest.layout.kpiBand
      .map((widgetId) => widgetState[widgetId])
      .filter((state): state is DashboardWidgetState => Boolean(state));
  }, [manifest, widgetState]);

  const chartWidgets = useMemo(() => {
    if (!manifest) {
      return [] as { state: DashboardWidgetState; placement?: DashboardGridPlacement }[];
    }
    const kpiSet = new Set(manifest.layout.kpiBand);
    return manifest.widgets
      .filter((widget) => !kpiSet.has(widget.id))
      .map((widget) => ({
        state: widgetState[widget.id],
        placement: manifest.layout.grid.placements[widget.id],
      }))
      .filter(
        (entry): entry is (typeof entry & { state: DashboardWidgetState }) => Boolean(entry.state),
      );
  }, [manifest, widgetState]);

  const handleRefresh = () => {
    setStatus("loading");
    setRunNonce((value) => value + 1);
  };

  const handleReloadManifest = () => {
    loadManifest();
  };

  const handleTimeRangeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus("loading");
    setSelectedTimeRangeId(event.target.value);
  };

  const handleUnpinWidget = useCallback(
    async (widgetId: string) => {
      if (!manifest) {
        return;
      }
      setStatus("loading");
      setError(null);
      abortControllerRef.current?.abort();
      if (!orgId) {
        setError("Cannot modify dashboard without an organisation context.");
        setStatus("error");
        return;
      }
      try {
        const updated = await unpinWidgetImpl(
          orgId,
          manifest.id ?? resolvedDashboardId,
          widgetId,
        );
        setManifest(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to remove widget";
        setError(message);
        setStatus("error");
      }
    },
    [manifest, orgId, resolvedDashboardId, unpinWidgetImpl],
  );

  const gridColumns = manifest?.layout.grid.columns ?? 12;
  const siteOrgId = manifest?.orgId ?? orgId;
  const siteIdFromQuery = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("client_id") ?? params.get("site_id") ?? undefined;
  }, []);
  const siteUiOrgId = resolvedUiClient ?? resolveUiClient(siteOrgId) ?? siteOrgId;
  const clientDisplayName = useMemo(() => formatTitleCase(siteUiOrgId), [siteUiOrgId]);
  const siteId = siteIdFromQuery ?? siteOrgId ?? "—";
  const siteDisplayId = useMemo(() => deriveSiteDisplayId(siteId), [siteId]);
  const isVrmDashboard = useMemo(() => {
    const ids = manifest?.layout?.kpiBand ?? [];
    if (!ids.length) {
      return false;
    }
    const vrmIds = new Set<string>(Object.values(VRM_KPI_IDS));
    return ids.every((id) => vrmIds.has(id));
  }, [manifest?.layout?.kpiBand]);

  return (
    <div className="dashboard-v2" aria-busy={status === "loading"}>
      <div className="dashboard-v2__content vrm-dashboard-shell">
        <header className="dashboard-v2__header vrm-section vrm-section--header">
          <div className="vrm-dashboard-header">
            <div className="vrm-dashboard-header-left">
              <div className="vrm-dashboard-avatar" aria-hidden="true" />
              <div className="vrm-dashboard-identity">
                <div className="vrm-dashboard-identity-label">Active site</div>
                <div className="vrm-dashboard-title">{`${clientDisplayName} – Site ${siteDisplayId}`}</div>
              </div>
            </div>
            <div className="vrm-dashboard-header-right">
              <HeaderStatusStrip className="vrm-dashboard-header-meta" />
            </div>
          </div>
          {!isVrmDashboard ? (
            <div className="dashboard-v2__controls">
              <div className="dashboard-v2__org">Site ID: {siteDisplayId}</div>
              <div className="dashboard-v2__control-group">
                {manifest?.timeControls?.options?.length ? (
                  <label className="dashboard-v2__control">
                    <span>Time range</span>
                    <select
                      value={selectedTimeRangeId ?? manifest.timeControls?.options?.[0]?.id ?? ""}
                      onChange={handleTimeRangeChange}
                    >
                      {(manifest.timeControls.options ?? []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button type="button" className="dashboard-v2__button" onClick={handleRefresh}>
                  Refresh data
                </button>
                <button type="button" className="dashboard-v2__button" onClick={handleReloadManifest}>
                  Reload manifest
                </button>
              </div>
            </div>
          ) : null}
        </header>

        {status === "error" && error ? (
          <div className="dashboard-v2__error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <section className="dashboard-v2__kpi-band vrm-section vrm-section--kpis">
          {kpiWidgets.length === 0 ? (
            <div className="dashboard-v2__empty" role="status">
              No KPI widgets yet. Pin single-value charts from the analytics workspace to populate this row.
            </div>
          ) : (
            kpiWidgets.map((state) => (
              <KpiTile
                key={state.widget.id}
                title={state.widget.title}
                result={state.result}
                state={state}
                locked={state.widget.locked}
                widgetId={state.widget.id}
                onRemove={
                  state.widget.locked ? undefined : () => handleUnpinWidget(state.widget.id)
                }
              />
            ))
          )}
        </section>

        {vrmDebugEnabled && kpiWidgets.length > 0 ? (
          <section className="dashboard-v2__debug" aria-label="VRM debug panel">
            <h2>VRM KPI debug (last bucket vs summary)</h2>
            <pre>
              {JSON.stringify(
                {
                  orgId,
                  manifestOrgId: manifest?.orgId,
                  resolvedUiClient,
                },
                null,
                2,
              )}
            </pre>
            <ul>
              {kpiWidgets.map((state) => {
                const series = state.result?.series?.[0];
                const lastBucket = lastBucketValue(series);
                const sum =
                  series?.data.reduce((total, point) => {
                    const value = point.value ?? point.y ?? 0;
                    return total + (typeof value === "number" ? value : 0);
                  }, 0) ?? 0;
                const headlineOverride = state.result?.meta?.summary
                  ? (state.result.meta.summary as Record<string, unknown>).headlineValue
                  : undefined;
                const usedHeadline =
                  typeof headlineOverride === "number"
                    ? headlineOverride
                    : series?.data?.[series.data.length - 1]?.value ??
                      series?.data?.[series.data.length - 1]?.y ??
                      null;
                const summaryTotals = (state.result as { summary?: unknown } | undefined)?.summary;
                return (
                  <li key={state.widget.id}>
                    <strong>{state.widget.title}</strong>
                    <pre>
                      {JSON.stringify(
                        {
                          widgetId: state.widget.id,
                          seriesY: series?.data?.map((point) => point.value ?? point.y) ?? [],
                          lastBucket,
                          sum24h: sum,
                          headlineOverride,
                          usedHeadline,
                          summaryTotals,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section
          className="dashboard-v2__grid vrm-section vrm-section--chart"
          style={{
            gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
            gridAutoRows: `${GRID_ROW_HEIGHT}px`,
          }}
        >
          {chartWidgets.length === 0 ? (
            <div className="dashboard-v2__empty" role="status">
              No charts pinned yet. Use “Pin to dashboard” from the analytics workspace to build your layout.
            </div>
          ) : (
            chartWidgets.map(({ state, placement }) => (
              <div
                key={state.widget.id}
                className="dashboard-v2__grid-item"
                style={buildGridStyle(placement)}
              >
                {isSiteFlowWidget(state.widget) ? (
                  <SiteFlowCard
                    subtitle={state.widget.subtitle}
                    state={state}
                    result={state.result}
                    locked={state.widget.locked}
                    widgetId={state.widget.id}
                    onRemove={
                      state.widget.locked ? undefined : () => handleUnpinWidget(state.widget.id)
                    }
                    mode={siteFlowMode}
                    onModeChange={setSiteFlowMode}
                    demographics={siteFlowDemographics}
                  />
                ) : (
                  <ChartCard
                    title={state.widget.title}
                    subtitle={state.widget.subtitle}
                    state={state}
                    result={state.result}
                    locked={state.widget.locked}
                    widgetId={state.widget.id}
                    onRemove={
                      state.widget.locked ? undefined : () => handleUnpinWidget(state.widget.id)
                    }
                  />
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
};

const DashboardV2PageWithBoundary = (props: DashboardV2PageProps) => (
  <ErrorBoundary name="dashboard-v2" fallbackMessage="Dashboard is temporarily unavailable.">
    <DashboardV2Page {...props} />
  </ErrorBoundary>
);

export { DashboardV2Page };
export default DashboardV2PageWithBoundary;
