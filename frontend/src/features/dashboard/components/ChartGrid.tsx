import React from "react";
import type { ReactNode } from "react";
import { Card } from "../../../analytics/components/Card/Card";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer/ChartRenderer";
import type {
  DashboardGridPlacement,
  DashboardWidgetState,
} from "../types";
import { buildGridStyle, GRID_ROW_HEIGHT } from "../utils/gridStyle";
import { isSiteFlowWidget } from "../utils/siteFlowDemographics";
import type { SiteFlowDemographicsData } from "../utils/siteFlowDemographics";
import type { SiteFlowTimeframe } from "../../../lib/siteFlowTimeframe";
import { renderError, renderLoading } from "./dashboardRenderers";
import SiteFlowCard from "./SiteFlowCard";

type ChartGridEntry = {
  state: DashboardWidgetState;
  placement?: DashboardGridPlacement;
};

type ChartGridProps = {
  mode?: "full" | "preview";
  chartWidgets: ChartGridEntry[];
  gridColumns: number;
  onRemoveWidget: (widgetId: string) => void;
  siteFlowMode: "activity" | "demographics";
  onSiteFlowModeChange: (mode: "activity" | "demographics") => void;
  siteFlowTimeframe: SiteFlowTimeframe;
  onSiteFlowTimeframeChange: (timeframe: SiteFlowTimeframe) => void;
  siteFlowDemographics: {
    status: "idle" | "loading" | "ready" | "error";
    data?: SiteFlowDemographicsData;
    error?: string;
  };
  siteFlowActivity: {
    status: "idle" | "loading" | "ready" | "error";
    result?: Parameters<typeof ChartRenderer>[0]["result"];
    error?: string;
  };
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
};

type ChartCardProps = {
  mode: "full" | "preview";
  title: string;
  subtitle?: string;
  state: DashboardWidgetState;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
  donutTooltipOwnerId?: string;
};

const ChartCard: React.FC<ChartCardProps> = ({
  mode,
  title,
  subtitle,
  state,
  result,
  locked,
  onRemove,
  widgetId,
  donutTooltipMode = "legacy",
  donutTooltipOwnerId,
}) => {
  let body: ReactNode = null;
  if (state.status === "loading") {
    body = renderLoading(title);
  } else if (state.status === "error") {
    body = renderError(state.error ?? `Failed to load ${title}`);
  } else {
    body = (
      <ChartRenderer
        result={result}
        height={360}
        widgetId={widgetId}
        donutTooltipMode={donutTooltipMode}
        donutTooltipOwnerId={donutTooltipOwnerId}
      />
    );
  }
  const footer =
    mode === "full" && !locked && onRemove ? (
      <div className="dashboard-v2__widget-footer">
        <button
          type="button"
          className="dashboard-v2__remove-button"
          onClick={onRemove}
        >
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

const ChartGrid: React.FC<ChartGridProps> = ({
  mode = "full",
  chartWidgets,
  gridColumns,
  onRemoveWidget,
  siteFlowMode,
  onSiteFlowModeChange,
  siteFlowTimeframe,
  onSiteFlowTimeframeChange,
  siteFlowDemographics,
  siteFlowActivity,
  donutTooltipMode = "legacy",
}) => (
  <section
    className="dashboard-v2__grid vrm-section vrm-section--chart"
    style={{
      gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
      gridAutoRows: `${GRID_ROW_HEIGHT}px`,
    }}
  >
    {chartWidgets.length === 0
      ? null
      : chartWidgets.map(({ state, placement }) => (
          <div
            key={state.widget.id}
            className="dashboard-v2__grid-item"
            style={buildGridStyle(placement)}
          >
            {isSiteFlowWidget(state.widget) ? (
              <SiteFlowCard
                mode={mode}
                locked={state.widget.locked}
                widgetId={state.widget.id}
                onRemove={
                  state.widget.locked || mode === "preview"
                    ? undefined
                    : () => onRemoveWidget(state.widget.id)
                }
                modeState={siteFlowMode}
                onModeChange={onSiteFlowModeChange}
                timeframe={siteFlowTimeframe}
                onTimeframeChange={onSiteFlowTimeframeChange}
                demographics={siteFlowDemographics}
                activity={siteFlowActivity}
                donutTooltipMode={donutTooltipMode}
              />
            ) : (
              <ChartCard
                mode={mode}
                title={state.widget.title}
                subtitle={state.widget.subtitle}
                state={state}
                result={state.result}
                locked={state.widget.locked}
                widgetId={state.widget.id}
                donutTooltipMode={donutTooltipMode}
                donutTooltipOwnerId={resolveDonutTooltipOwnerId(state.widget.id, state.result)}
                onRemove={
                  state.widget.locked || mode === "preview"
                    ? undefined
                    : () => onRemoveWidget(state.widget.id)
                }
              />
            )}
          </div>
        ))}
  </section>
);

export default ChartGrid;
