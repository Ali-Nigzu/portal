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
};

type ChartCardProps = {
  title: string;
  subtitle?: string;
  state: DashboardWidgetState;
  result?: Parameters<typeof ChartRenderer>[0]["result"];
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
};

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  state,
  result,
  locked,
  onRemove,
  widgetId,
}) => {
  let body: ReactNode = null;
  if (state.status === "loading") {
    body = renderLoading(title);
  } else if (state.status === "error") {
    body = renderError(state.error ?? `Failed to load ${title}`);
  } else {
    body = <ChartRenderer result={result} height={360} widgetId={widgetId} />;
  }
  const footer =
    !locked && onRemove ? (
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

const ChartGrid: React.FC<ChartGridProps> = ({
  chartWidgets,
  gridColumns,
  onRemoveWidget,
  siteFlowMode,
  onSiteFlowModeChange,
  siteFlowTimeframe,
  onSiteFlowTimeframeChange,
  siteFlowDemographics,
  siteFlowActivity,
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
                locked={state.widget.locked}
                widgetId={state.widget.id}
                onRemove={
                  state.widget.locked
                    ? undefined
                    : () => onRemoveWidget(state.widget.id)
                }
                mode={siteFlowMode}
                onModeChange={onSiteFlowModeChange}
                timeframe={siteFlowTimeframe}
                onTimeframeChange={onSiteFlowTimeframeChange}
                demographics={siteFlowDemographics}
                activity={siteFlowActivity}
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
                  state.widget.locked
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
