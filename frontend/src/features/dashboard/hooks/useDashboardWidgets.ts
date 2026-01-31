import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DashboardGridPlacement,
  DashboardManifest,
  DashboardWidget,
  DashboardWidgetState,
} from "../types";
import type { LoadWidgetOptions } from "../transport/loadWidgetResult";
import { loadWidgetResult, isAbortError } from "../transport/loadWidgetResult";
import { unpinDashboardWidget } from "../transport/mutateDashboardManifest";
import { decorateResult } from "../utils/vrmDecorators";
import { logError, logInfo } from "../../../common/utils/logger";
import { VRM_KPI_IDS } from "../utils/applyVRMOverrides";
import { isSiteFlowWidget } from "../utils/siteFlowDemographics";

const WIDGET_STATUS_DEFAULT: DashboardWidgetState["status"] = "idle";

type WidgetResultLoader = typeof loadWidgetResult;

type UnpinMutator = (
  orgId: string,
  dashboardId: string,
  widgetId: string,
) => Promise<DashboardManifest>;

type UseDashboardWidgetsParams = {
  manifest: DashboardManifest | null;
  selectedTimeRange: DashboardTimeRangeOption | null;
  orgId: string | undefined;
  viewToken: string | null;
  clientContextId: string | undefined;
  widgetResultLoader?: WidgetResultLoader;
  unpinWidget?: UnpinMutator;
  resolvedDashboardId: string;
  setManifest: (manifest: DashboardManifest | null) => void;
};

type ChartWidgetsEntry = {
  state: DashboardWidgetState;
  placement?: DashboardGridPlacement;
};

type DashboardTimeRangeOption = NonNullable<
  DashboardManifest["timeControls"]
>["options"][number];

type UseDashboardWidgetsResult = {
  widgetState: Record<string, DashboardWidgetState>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  kpiWidgets: DashboardWidgetState[];
  chartWidgets: ChartWidgetsEntry[];
  handleUnpinWidget: (widgetId: string) => Promise<void>;
};

export const useDashboardWidgets = ({
  manifest,
  selectedTimeRange,
  orgId,
  viewToken,
  clientContextId,
  widgetResultLoader,
  unpinWidget,
  resolvedDashboardId,
  setManifest,
}: UseDashboardWidgetsParams): UseDashboardWidgetsResult => {
  const widgetResultLoaderImpl = widgetResultLoader ?? loadWidgetResult;
  const unpinWidgetImpl = unpinWidget ?? unpinDashboardWidget;
  const [widgetState, setWidgetState] = useState<
    Record<string, DashboardWidgetState>
  >({});
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >(WIDGET_STATUS_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!manifest) {
      setWidgetState({});
      return;
    }
    setWidgetState((previous) => {
      const next: Record<string, DashboardWidgetState> = {};
      manifest.widgets.forEach((widget) => {
        const prior = previous[widget.id];
        next[widget.id] = prior
          ? { ...prior, widget }
          : { widget, status: "idle" };
      });
      return next;
    });
  }, [manifest]);

  useEffect(() => {
    if (!manifest) {
      return;
    }
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStatus("loading");
    setError(null);
    const widgetsToLoad = manifest.widgets.filter(
      (widget) => !isSiteFlowWidget(widget),
    );
    setWidgetState((previous) => {
      const next: Record<string, DashboardWidgetState> = {};
      manifest.widgets.forEach((widget) => {
        const prior = previous[widget.id];
        if (isSiteFlowWidget(widget)) {
          next[widget.id] = prior
            ? { ...prior, widget }
            : { widget, status: "idle" };
        } else {
          next[widget.id] = {
            widget,
            status: "loading",
            result: prior?.result,
          };
        }
      });
      return next;
    });
    let encounteredError = false;
    const timezone = manifest.timeControls?.timezone;
    const run = async () => {
      await Promise.all(
        widgetsToLoad.map(async (widget) => {
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
            if (!import.meta.env.PROD && widget.id === VRM_KPI_IDS.traffic) {
              const summary = result.meta?.summary as
                | Record<string, unknown>
                | undefined;
              console.log("[VRM] raw widget result", {
                widgetId: widget.id,
                chartType: result.chartType,
                chartStyle: summary?.chartStyle,
                chartSubType: summary?.chartSubType,
                seriesLength: result.series.length,
                firstPoints: result.series[0]?.data
                  ?.slice(0, 5)
                  ?.map((point) => ({
                    x: point.x,
                    value: point.value ?? point.y,
                  })),
              });
            }
            const decorated = decorateResult(
              widget.id,
              result,
              clientContextId,
            );
            setWidgetState((previous) => ({
              ...previous,
              [widget.id]: { widget, result: decorated, status: "ready" },
            }));
          } catch (err) {
            if (controller.signal.aborted) {
              return;
            }
            if (isAbortError(err)) {
              const code = (err as { code?: string }).code;
              if (code === "ABORTED") {
                logInfo("dashboard.widgets", "ui_widget_cancelled", {
                  widgetId: widget.id,
                });
                return;
              }
            }
            encounteredError = true;
            const message =
              err instanceof Error ? err.message : "Unknown widget error";
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
        logInfo("dashboard.widgets", "ui_batch_success", {
          manifestId: manifest.id,
        });
      }
    };
    run().catch((err) => {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        err instanceof Error ? err.message : "Unable to load dashboard widgets";
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
    widgetResultLoaderImpl,
    orgId,
    viewToken,
    clientContextId,
  ]);

  const kpiWidgets = useMemo(() => {
    if (!manifest) {
      return [] as DashboardWidgetState[];
    }
    const kpiStates = manifest.layout.kpiBand.map(
      (widgetId) => widgetState[widgetId],
    );
    return kpiStates.filter((state): state is DashboardWidgetState =>
      Boolean(state),
    );
  }, [manifest, widgetState]);

  const chartWidgets = useMemo(() => {
    if (!manifest) {
      return [] as ChartWidgetsEntry[];
    }
    const kpiSet = new Set(manifest.layout.kpiBand);
    const mappedWidgets = manifest.widgets
      .filter((widget) => !kpiSet.has(widget.id))
      .map((widget) => ({
        state: widgetState[widget.id],
        placement: manifest.layout.grid.placements[widget.id],
      }));
    return mappedWidgets.filter(
      (entry): entry is ChartWidgetsEntry => Boolean(entry.state),
    );
  }, [manifest, widgetState]);

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
        const message =
          err instanceof Error ? err.message : "Unable to remove widget";
        setError(message);
        setStatus("error");
      }
    },
    [manifest, orgId, resolvedDashboardId, setManifest, unpinWidgetImpl],
  );

  return {
    widgetState,
    status,
    error,
    kpiWidgets,
    chartWidgets,
    handleUnpinWidget,
  };
};
