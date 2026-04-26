import React from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer/ChartRenderer";
import type { DashboardWidgetState } from "../types";
import { renderError, renderLoading } from "./dashboardRenderers";

type KpiBandProps = {
  mode?: "full" | "preview";
  kpiWidgets: DashboardWidgetState[];
  onRemoveWidget: (widgetId: string) => void;
  rendererClassName?: string;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
};

type KpiTileProps = {
  mode: "full" | "preview";
  title: string;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  state: DashboardWidgetState;
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
  rendererClassName?: string;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
  donutTooltipOwnerId?: string;
};

const PREVIEW_KPI_HEIGHT = 76;

const KpiTile: React.FC<KpiTileProps> = ({
  mode,
  title,
  result,
  state,
  locked,
  onRemove,
  widgetId,
  rendererClassName,
  donutTooltipMode = "legacy",
  donutTooltipOwnerId,
}) => {
  const summary = result?.meta?.summary ?? {};
  const headline =
    typeof summary.headline === "string" ? summary.headline : null;
  const renderedResult = result
    ? ({
        ...result,
        meta: {
          ...(result.meta ?? { timezone: "UTC" }),
          summary: { ...(result.meta?.summary ?? {}), title },
        },
      } as Parameters<typeof ChartRenderer>[0]["result"])
    : result;
  const isPreview = mode === "preview";
  const kpiHeight = isPreview ? PREVIEW_KPI_HEIGHT : 168;
  let content: ReactNode = null;
  if (state.status === "loading") {
    content = renderLoading(title, "kpi");
  } else if (state.status === "error") {
    content = renderError(state.error ?? `Failed to load ${title}`);
  } else {
    const baseRendererClassName = isPreview
      ? "dashboard-v2__kpi-renderer dashboard-v2__kpi-renderer--preview"
      : "dashboard-v2__kpi-renderer";
    const mergedRendererClassName = `${baseRendererClassName} ${rendererClassName ?? ""}`.trim();
    content = (
      <ChartRenderer
        result={renderedResult!}
        height={kpiHeight}
        className={mergedRendererClassName}
        widgetId={widgetId}
        donutTooltipMode={donutTooltipMode}
        donutTooltipOwnerId={donutTooltipOwnerId}
      />
    );
  }
  const showRemove = mode === "full" && Boolean(onRemove) && !locked;
  return (
    <div
      className="dashboard-v2__kpi-tile vrm-kpi-tile vrm-kpi-tile--panel"
      data-state={state.status}
      style={{ paddingBottom: 0 }}
    >
      {showRemove ? (
        <div className="dashboard-v2__kpi-controls">
          <button
            type="button"
            className="dashboard-v2__remove-button"
            onClick={onRemove}
          >
            Unpin
          </button>
        </div>
      ) : null}
      <div
        className="dashboard-v2__kpi-content"
        aria-label={title}
        data-headline={headline ?? undefined}
      >
        {content}
      </div>
    </div>
  );
};

const resolveDonutTooltipOwnerId = (
  widgetId: string,
  result?: Parameters<typeof ChartRenderer>[0]["result"],
): string | undefined => {
  const summary = result?.meta?.summary as
    | { chartStyle?: string; chartSubType?: string }
    | undefined;
  const chartStyle =
    summary?.chartStyle ||
    (result as unknown as { chartStyle?: string } | undefined)?.chartStyle;
  const chartSubType =
    summary?.chartSubType ||
    (result as unknown as { chartSubType?: string } | undefined)?.chartSubType;
  if (chartStyle === "capacity_usage" || chartSubType === "capacity_usage") {
    return "capacity";
  }
  if (chartStyle === "traffic_distribution" || chartSubType === "traffic_distribution") {
    return widgetId.startsWith("site-flow-") ? widgetId : "traffic-split";
  }
  return undefined;
};

const KpiBand: React.FC<KpiBandProps> = ({
  mode = "full",
  kpiWidgets,
  onRemoveWidget,
  rendererClassName,
  donutTooltipMode = "legacy",
}) => {
  if (kpiWidgets.length === 0) {
    return null;
  }
  const bandClassName = `dashboard-v2__kpi-band vrm-section vrm-section--kpis ${mode === "preview" ? "dashboard-v2__kpi-band--preview" : ""}`.trim();
  const bandStyle = mode === "preview"
    ? ({ "--dashboard-kpi-preview-height": `${PREVIEW_KPI_HEIGHT}px` } as CSSProperties)
    : undefined;
  return (
    <section className={bandClassName} style={bandStyle}>
      {kpiWidgets.map((state) => (
        <KpiTile
          mode={mode}
          key={state.widget.id}
          title={state.widget.title}
          result={state.result}
          state={state}
          locked={state.widget.locked}
          widgetId={state.widget.id}
          rendererClassName={rendererClassName}
          donutTooltipMode={donutTooltipMode}
          donutTooltipOwnerId={resolveDonutTooltipOwnerId(state.widget.id, state.result)}
          onRemove={
            state.widget.locked
              ? undefined
              : () => onRemoveWidget(state.widget.id)
          }
        />
      ))}
    </section>
  );
};

export default KpiBand;
