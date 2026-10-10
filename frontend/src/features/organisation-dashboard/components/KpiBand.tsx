import React from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer/ChartRenderer";

type KpiBandProps = {
  mode?: "full" | "preview";
  kpiWidgets: KpiState[];
  rendererClassName?: string;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
};

type KpiTileProps = {
  mode: "full" | "preview";
  title: string;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  state: KpiState;
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
    content = renderLoading(title);
  } else if (state.status === "error") {
    content = renderError(state.error ?? `Failed to load ${title}`);
  } else {
    const baseRendererClassName = isPreview
      ? "dashboard-v2__kpi-renderer dashboard-v2__kpi-renderer--preview"
      : "dashboard-v2__kpi-renderer";
    const mergedRendererClassName =
      `${baseRendererClassName} ${rendererClassName ?? ""}`.trim();
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
  return (
    <div
      className="dashboard-v2__kpi-tile vrm-kpi-tile vrm-kpi-tile--panel"
      data-state={state.status}
      style={{ paddingBottom: 0 }}
    >
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
    { chartStyle?: string; chartSubType?: string } | undefined;
  const chartStyle =
    summary?.chartStyle ||
    (result as unknown as { chartStyle?: string } | undefined)?.chartStyle;
  const chartSubType =
    summary?.chartSubType ||
    (result as unknown as { chartSubType?: string } | undefined)?.chartSubType;
  if (chartStyle === "capacity_usage" || chartSubType === "capacity_usage") {
    return "capacity";
  }
  if (
    chartStyle === "traffic_distribution" ||
    chartSubType === "traffic_distribution"
  ) {
    return widgetId.startsWith("site-flow-") ? widgetId : "traffic-split";
  }
  return undefined;
};

const KpiBand: React.FC<KpiBandProps> = ({
  mode = "full",
  kpiWidgets,
  rendererClassName,
  donutTooltipMode = "legacy",
}) => {
  if (kpiWidgets.length === 0) {
    return null;
  }
  const bandClassName =
    `dashboard-v2__kpi-band vrm-section vrm-section--kpis ${mode === "preview" ? "dashboard-v2__kpi-band--preview" : ""}`.trim();
  const bandStyle =
    mode === "preview"
      ? ({
          "--dashboard-kpi-preview-height": `${PREVIEW_KPI_HEIGHT}px`,
        } as CSSProperties)
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
          widgetId={state.widget.id}
          rendererClassName={rendererClassName}
          donutTooltipMode={donutTooltipMode}
          donutTooltipOwnerId={resolveDonutTooltipOwnerId(
            state.widget.id,
            state.result,
          )}
        />
      ))}
    </section>
  );
};

const renderLoading = (label: string) => (
  <div
    className="dashboard-v2__skeleton dashboard-v2__skeleton--kpi"
    role="status"
    aria-label={`Loading ${label}`}
  >
    <span className="dashboard-v2__skeleton-line" />
  </div>
);

const renderError = (message: string) => (
  <div className="dashboard-v2__error" role="alert">
    {message}
  </div>
);

type DashboardKpiSectionProps = {
  mode?: "full" | "preview";
  kpiWidgets: KpiState[];
  className?: string;
  rendererClassName?: string;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
};

const DashboardKpiSection: React.FC<DashboardKpiSectionProps> = ({
  mode = "full",
  kpiWidgets,
  className,
  rendererClassName,
  donutTooltipMode = "legacy",
}) => {
  if (kpiWidgets.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <KpiBand
        mode={mode}
        kpiWidgets={kpiWidgets}
        rendererClassName={rendererClassName}
        donutTooltipMode={donutTooltipMode}
      />
    </div>
  );
};

export { DashboardKpiSection };

export type KpiState = {
  widget: { id: string; title: string };
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};
