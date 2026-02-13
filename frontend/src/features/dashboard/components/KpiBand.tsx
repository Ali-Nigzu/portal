import React from "react";
import type { ReactNode } from "react";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer/ChartRenderer";
import type { DashboardWidgetState } from "../types";
import { renderError, renderLoading } from "./dashboardRenderers";

type KpiBandProps = {
  mode?: "full" | "preview";
  kpiWidgets: DashboardWidgetState[];
  onRemoveWidget: (widgetId: string) => void;
};

type KpiTileProps = {
  mode: "full" | "preview";
  title: string;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  state: DashboardWidgetState;
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
};

const KpiTile: React.FC<KpiTileProps> = ({
  mode,
  title,
  result,
  state,
  locked,
  onRemove,
  widgetId,
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
  const kpiHeight = isPreview ? 72 : 168;
  let content: ReactNode = null;
  if (state.status === "loading") {
    content = renderLoading(title, "kpi");
  } else if (state.status === "error") {
    content = renderError(state.error ?? `Failed to load ${title}`);
  } else {
    content = (
      <ChartRenderer
        result={renderedResult!}
        height={kpiHeight}
        className="dashboard-v2__kpi-renderer"
        widgetId={widgetId}
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
        style={isPreview ? { minHeight: `${kpiHeight}px` } : undefined}
      >
        {content}
      </div>
    </div>
  );
};

const KpiBand: React.FC<KpiBandProps> = ({ mode = "full", kpiWidgets, onRemoveWidget }) => {
  if (kpiWidgets.length === 0) {
    return null;
  }
  const bandClassName = `dashboard-v2__kpi-band vrm-section vrm-section--kpis ${mode === "preview" ? "dashboard-v2__kpi-band--preview" : ""}`.trim();
  return (
    <section className={bandClassName}>
      {kpiWidgets.map((state) => (
        <KpiTile
          mode={mode}
          key={state.widget.id}
          title={state.widget.title}
          result={state.result}
          state={state}
          locked={state.widget.locked}
          widgetId={state.widget.id}
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
