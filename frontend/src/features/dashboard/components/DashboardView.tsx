import React from "react";
import type { DashboardGridPlacement, DashboardWidgetState } from "../types";
import type { SiteFlowDemographicsData } from "../utils/siteFlowDemographics";
import type { SiteFlowTimeframe } from "../../../lib/siteFlowTimeframe";
import DashboardHeader from "./DashboardHeader";
import DashboardKpiSection from "./DashboardKpiSection";
import ChartGrid from "./ChartGrid";
import type { ChartResult } from "../../../analytics/schemas/charting";

type ChartWidgetsEntry = {
  state: DashboardWidgetState;
  placement?: DashboardGridPlacement;
};

interface DashboardViewProps {
  mode?: "full" | "preview";
  clientId?: string;
  siteLabel?: string;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  kpiWidgets: DashboardWidgetState[];
  chartWidgets: ChartWidgetsEntry[];
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
    result?: ChartResult;
    error?: string;
  };
}

const DashboardView: React.FC<DashboardViewProps> = ({
  mode = "full",
  clientId,
  siteLabel,
  status,
  error,
  kpiWidgets,
  chartWidgets,
  gridColumns,
  onRemoveWidget,
  siteFlowMode,
  onSiteFlowModeChange,
  siteFlowTimeframe,
  onSiteFlowTimeframeChange,
  siteFlowDemographics,
  siteFlowActivity,
}) => {
  const isPreview = mode === "preview";

  return (
    <div
      className={`dashboard-v2 ${isPreview ? "dashboard-v2--preview" : ""}`}
      aria-busy={status === "loading"}
    >
      <div className="dashboard-v2__content vrm-dashboard-shell">
        <DashboardHeader clientId={clientId} siteLabelOverride={siteLabel} mode={mode} />
        {status === "error" && error ? (
          <div
            className={`dashboard-v2__error-banner ${
              isPreview ? "dashboard-v2__error-banner--preview" : ""
            }`}
            role="alert"
          >
            {isPreview ? "Preview temporarily unavailable." : error}
          </div>
        ) : null}
        <DashboardKpiSection
          mode={mode}
          kpiWidgets={kpiWidgets}
          onRemoveWidget={onRemoveWidget}
        />
        <ChartGrid
          mode={mode}
          chartWidgets={chartWidgets}
          gridColumns={gridColumns}
          onRemoveWidget={onRemoveWidget}
          siteFlowMode={siteFlowMode}
          onSiteFlowModeChange={onSiteFlowModeChange}
          siteFlowTimeframe={siteFlowTimeframe}
          onSiteFlowTimeframeChange={onSiteFlowTimeframeChange}
          siteFlowDemographics={siteFlowDemographics}
          siteFlowActivity={siteFlowActivity}
        />
      </div>
    </div>
  );
};

export type { ChartWidgetsEntry, DashboardViewProps };
export default DashboardView;
