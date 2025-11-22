import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../../../analytics/components/Card";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer";
import type { ChartResult, ChartSeries, DataPoint } from "../../../analytics/schemas/charting";
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
import { determineOrgId } from "../../../utils/org";
import { getViewTokenFromLocation } from "../../../utils/viewToken";
import { Credentials } from "../../../types/credentials";
import "../styles/DashboardV2Page.css";
import { VRM_KPI_IDS, applyVRMOverrides } from "../utils/applyVRMOverrides";

const GRID_ROW_HEIGHT = 96;

const FIXED_KPI_IDS = new Set<string>(Object.values(VRM_KPI_IDS));

const CAPACITY_MAP: Record<string, number> = {
  client0: 100,
  client1: 100,
  client2: 1000,
};

const cloneResult = (result: ChartResult): ChartResult =>
  JSON.parse(JSON.stringify(result)) as ChartResult;

const ensureSummary = (result: ChartResult) => {
  if (!result.meta) {
    result.meta = { timezone: "UTC" } as ChartResult["meta"];
  }
  result.meta.summary = result.meta.summary ?? {};
};

const markCompact = (result: ChartResult) => {
  ensureSummary(result);
  result.meta.summary!.compact = 1 as unknown as string | number | null;
};

const addSummaryText = (result: ChartResult, key: string, value?: string) => {
  if (!value) {
    return;
  }
  ensureSummary(result);
  result.meta.summary![key] = value;
};

const sumSeries = (series?: ChartSeries) => {
  if (!series) {
    return 0;
  }
  return series.data.reduce((total, point) => {
    const value = point.value ?? point.y ?? 0;
    return total + (typeof value === "number" ? value : 0);
  }, 0);
};

const getLastTwoValues = (series?: ChartSeries): { last: number | null; previous: number | null } => {
  if (!series || !series.data.length) {
    return { last: null, previous: null };
  }
  const lastPoint = series.data[series.data.length - 1];
  const previousPoint = series.data[series.data.length - 2];
  const last = (lastPoint?.value ?? lastPoint?.y ?? null) as number | null;
  const previous = (previousPoint?.value ?? previousPoint?.y ?? null) as number | null;
  return { last, previous };
};

const formatDeltaText = (value: number | null) => {
  if (value === null) {
    return undefined;
  }
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  return `${sign}${Math.round(value)}`;
};

const getStartOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const buildTrafficPlaceholderResult = (): ChartResult => ({
  chartType: "single_value",
  xDimension: { id: "timestamp", type: "time", bucket: "15_MIN", timezone: "UTC" },
  series: [
    {
      id: "traffic_share",
      label: "Traffic distribution",
      geometry: "metric",
      unit: "percentage",
      data: [{ x: new Date().toISOString(), value: 100, y: 100 }],
    },
  ],
  meta: {
    summary: { headline: "Camera – 100% of events", compact: 1 as unknown as number },
    timezone: "UTC",
  },
});

const applyTrafficDistributionShare = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  ensureSummary(next);
  if (!series) {
    return next;
  }
  const total = sumSeries(series);
  let topCamera = "";
  let topShare = 0;
  series.data = series.data.map((point) => {
    const raw = point.value ?? point.y ?? 0;
    const share = total > 0 ? (Number(raw) / total) * 100 : 0;
    if (share >= topShare) {
      topShare = share;
      topCamera = String(point.x ?? "Camera");
    }
    return { ...point, value: share, y: share } as DataPoint;
  });
  addSummaryText(next, "headline", `${topCamera} – ${Math.round(topShare)}% of events`);
  return next;
};

const applyCapacityUsage = (result: ChartResult, orgId: string | undefined): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  const capacity = CAPACITY_MAP[orgId ?? "client0"] ?? 100;
  if (!series || !capacity) {
    return next;
  }

  const occupancyPoints = [...series.data];
  const { last, previous } = getLastTwoValues(series);
  const deltaOccupancy = typeof last === "number" && typeof previous === "number" ? last - previous : null;
  const occupancyNow = typeof last === "number" ? last : null;

  const startOfDay = getStartOfToday();

  const peakOccupancy = occupancyPoints.reduce((peak, point) => {
    const timestamp = point.x ? new Date(point.x) : null;
    const withinDay = timestamp ? timestamp >= startOfDay : true;
    const value = point.value ?? point.y ?? 0;
    if (!withinDay) {
      return peak;
    }
    return Math.max(peak, Number(value));
  }, 0);

  const currentUsage =
    typeof occupancyNow === "number" && capacity > 0 ? (occupancyNow / capacity) * 100 : null;
  const peakToday = capacity > 0 ? (peakOccupancy / capacity) * 100 : 0;

  const lastPoint = occupancyPoints[occupancyPoints.length - 1];
  const lastUsagePoint: DataPoint | undefined = lastPoint
    ? ({ x: lastPoint.x, value: currentUsage, y: currentUsage } as DataPoint)
    : undefined;

  series.unit = "percentage";
  series.label = "Capacity usage";
  series.data = lastUsagePoint ? [lastUsagePoint] : [];

  if (!next.meta.summary) {
    next.meta.summary = {};
  }

  next.meta.summary.capacity_usage_now = currentUsage;
  next.meta.summary.peak_capacity_usage_today = peakToday;
  next.meta.summary.occupancy_delta_15m = deltaOccupancy;

  const peakWithinDay = occupancyPoints
    .filter((point) => {
      const ts = point.x ? new Date(point.x) : null;
      return ts ? ts >= startOfDay : true;
    })
    .reduce((peak, point) => Math.max(peak, Number(point.value ?? point.y ?? 0)), 0);

  next.meta.summary.peak_occupancy_today = peakWithinDay;

  addSummaryText(next, "secondaryText", `Peak today: ${Math.round(peakToday)}%`);
  return next;
};

const applyFootfallTotal = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  ensureSummary(next);
  const primary = next.series[0];
  const total = sumSeries(primary);
  addSummaryText(next, "secondaryText", `24h total: ${Math.round(total)}`);
  return next;
};

const applyOccupancyDelta = (result: ChartResult): ChartResult => {
  const next = cloneResult(result);
  markCompact(next);
  const series = next.series[0];
  const { last, previous } = getLastTwoValues(series);
  const deltaText = formatDeltaText(
    typeof last === "number" && typeof previous === "number" ? last - previous : null,
  );
  addSummaryText(next, "secondaryText", deltaText ? `Δ vs 15m ago: ${deltaText}` : undefined);
  return next;
};

const decorateResult = (
  widgetId: string,
  result: ChartResult,
  orgId: string | undefined,
): ChartResult => {
  if (!FIXED_KPI_IDS.has(widgetId)) {
    return result;
  }
  markCompact(result);
  if (widgetId === VRM_KPI_IDS.traffic) {
    return applyTrafficDistributionShare(result);
  }
  if (widgetId === VRM_KPI_IDS.capacity) {
    return applyCapacityUsage(result, orgId);
  }
  if (widgetId === VRM_KPI_IDS.footfall) {
    return applyFootfallTotal(result);
  }
  if (widgetId === VRM_KPI_IDS.occupancy) {
    return applyOccupancyDelta(result);
  }
  return result;
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
}: {
  title: string;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  state: DashboardWidgetState;
  locked?: boolean;
  onRemove?: () => void;
}) => {
  const summary = result?.meta?.summary ?? {};
  const headline = typeof summary.headline === "string" ? summary.headline : null;
  const secondary = typeof summary.secondaryText === "string" ? summary.secondaryText : null;
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
        <div className="dashboard-v2__kpi-title-block">
          <div className="dashboard-v2__kpi-title">{title}</div>
          {headline ? <div className="dashboard-v2__kpi-subtitle">{headline}</div> : null}
          {secondary ? <div className="dashboard-v2__kpi-secondary">{secondary}</div> : null}
        </div>
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
  const abortControllerRef = useRef<AbortController | null>(null);

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
          if (widget.id === VRM_KPI_IDS.traffic) {
            const trafficResult = buildTrafficPlaceholderResult();
            setWidgetState((previous) => ({
              ...previous,
              [widget.id]: {
                widget,
                result: trafficResult,
                status: "ready",
              },
            }));
            return;
          }
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
            const decorated = decorateResult(widget.id, result, orgId);
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
  }, [manifest, selectedTimeRange, runNonce, widgetResultLoaderImpl, orgId, viewToken]);

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
  const localTimeLabel = useMemo(
    () => localTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [localTime],
  );
  const siteLabel = manifest?.orgId ?? orgId ?? "Site";
  const siteId = orgId ?? manifest?.orgId ?? "—";

  return (
    <div className="dashboard-v2" aria-busy={status === "loading"}>
      <header className="dashboard-v2__header">
        <div className="dashboard-v2__title-block">
          <h1 className="dashboard-v2__title">{`${siteLabel} – ${siteId}`}</h1>
          <div className="dashboard-v2__meta-row">
            <span>Last updated: Realtime</span>
            <span>• Status: OK</span>
            <span>• Local time: {localTimeLabel}</span>
          </div>
        </div>
        <div className="dashboard-v2__controls">
          <div className="dashboard-v2__org">Site ID: {siteId}</div>
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
