import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../../../analytics/components/Card";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer";
import ErrorBoundary from "../../../common/components/ErrorBoundary";
import { logError, logInfo } from "../../../common/utils/logger";
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
} from "../transport/loadWidgetResult";
import { unpinDashboardWidget } from "../transport/mutateDashboardManifest";
import { determineOrgId } from "../utils/determineOrgId";
import "../styles/DashboardV2Page.css";

const GRID_ROW_HEIGHT = 96;

type ManifestLoader = (
  orgId: string,
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
  credentials: { username: string; password: string };
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
}: {
  title: string;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  state: DashboardWidgetState;
  locked?: boolean;
  onRemove?: () => void;
}) => {
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
        result={result}
        height={168}
        className="dashboard-v2__kpi-renderer"
      />
    );
  }

  const showRemove = Boolean(onRemove) && !locked;

  return (
    <div className="dashboard-v2__kpi-tile" data-state={state.status}>
      <div className="dashboard-v2__kpi-head">
        <div className="dashboard-v2__kpi-title">{title}</div>
        {showRemove ? (
          <button
            type="button"
            className="dashboard-v2__remove-button"
            onClick={onRemove}
          >
            Unpin
          </button>
        ) : null}
      </div>
      {content}
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
}: {
  title: string;
  subtitle?: string;
  state: DashboardWidgetState;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  locked?: boolean;
  onRemove?: () => void;
}) => {
  let body: JSX.Element;
  if (state.status === "loading") {
    body = renderLoading(title);
  } else if (state.status === "error") {
    body = renderError(state.error ?? `Failed to load ${title}`);
  } else if (!result) {
    body = renderError("No data available");
  } else {
    body = <ChartRenderer result={result} height={360} />;
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
      className="dashboard-v2__chart-card"
      footer={footer}
    >
      {body}
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
  const orgId = determineOrgId(credentials);
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadManifest = useCallback(async () => {
    setStatus("loading");
    setError(null);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    logInfo("dashboard.manifest", "ui_fetch_start", {
      orgId,
      dashboardId: resolvedDashboardId,
    });
    try {
      const data = await manifestLoaderImpl(orgId, resolvedDashboardId, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      logInfo("dashboard.manifest", "ui_fetch_success", {
        orgId,
        dashboardId: resolvedDashboardId,
      });
      setManifest(data);
    } catch (err) {
      if (controller.signal.aborted) {
        logInfo("dashboard.manifest", "ui_fetch_aborted", {
          orgId,
          dashboardId: resolvedDashboardId,
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Unable to load dashboard";
      logError("dashboard.manifest", "ui_fetch_error", {
        orgId,
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
  }, [manifestLoaderImpl, orgId, resolvedDashboardId]);

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
            });
            if (controller.signal.aborted) {
              return;
            }
            setWidgetState((previous) => ({
              ...previous,
              [widget.id]: {
                widget,
                result,
                status: "ready",
              },
            }));
          } catch (err) {
            if (controller.signal.aborted) {
              return;
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
  }, [manifest, selectedTimeRange, runNonce, widgetResultLoaderImpl, orgId]);

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

  return (
    <div className="dashboard-v2" aria-busy={status === "loading"}>
      <header className="dashboard-v2__header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-v2__subtitle">
            Manifest-driven dashboard powered by the shared analytics engine and live manifests.
          </p>
        </div>
        <div className="dashboard-v2__controls">
          <div className="dashboard-v2__org">Organisation: {orgId}</div>
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
      </header>

      {status === "error" && error ? (
        <div className="dashboard-v2__error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <section className="dashboard-v2__kpi-band">
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
              onRemove={
                state.widget.locked ? undefined : () => handleUnpinWidget(state.widget.id)
              }
            />
          ))
        )}
      </section>

      <section
        className="dashboard-v2__grid"
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
              <ChartCard
                title={state.widget.title}
                subtitle={state.widget.subtitle}
                state={state}
                result={state.result}
                locked={state.widget.locked}
                onRemove={
                  state.widget.locked ? undefined : () => handleUnpinWidget(state.widget.id)
                }
              />
            </div>
          ))
        )}
      </section>
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
