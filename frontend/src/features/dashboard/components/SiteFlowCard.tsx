import React from "react";
import { Card } from "../../../analytics/components/Card/Card";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer/ChartRenderer";
import { SiteFlowDemographicsView } from "./SiteFlowDemographicsView";
import type { SiteFlowDemographicsData } from "../utils/siteFlowDemographics";
import {
  SITE_FLOW_TIMEFRAME_OPTIONS,
  type SiteFlowTimeframe,
} from "../../../lib/siteFlowTimeframe";
import { renderError } from "./dashboardRenderers";

type SiteFlowCardProps = {
  subtitle?: string;
  locked?: boolean;
  onRemove?: () => void;
  widgetId: string;
  mode: "activity" | "demographics";
  onModeChange: (mode: "activity" | "demographics") => void;
  timeframe: SiteFlowTimeframe;
  onTimeframeChange: (timeframe: SiteFlowTimeframe) => void;
  demographics: {
    status: "idle" | "loading" | "ready" | "error";
    data?: SiteFlowDemographicsData;
    error?: string;
  };
  activity: {
    status: "idle" | "loading" | "ready" | "error";
    result?: Parameters<typeof ChartRenderer>[0]["result"];
    error?: string;
  };
};

const SiteFlowCard: React.FC<SiteFlowCardProps> = ({
  subtitle,
  locked,
  onRemove,
  widgetId,
  mode,
  onModeChange,
  timeframe,
  onTimeframeChange,
  demographics,
  activity,
}) => {
  const renderSiteFlowBody = () => {
    if (mode === "demographics") {
      if (demographics.status === "loading") {
        return null;
      }
      if (demographics.status === "error") {
        return renderError(demographics.error ?? "Failed to load demographics");
      }
      if (demographics.status !== "ready" || !demographics.data) {
        return null;
      }
      return <SiteFlowDemographicsView data={demographics.data} />;
    }
    if (activity.status === "loading") {
      return null;
    }
    if (activity.status === "error") {
      return renderError(activity.error ?? "Failed to load Site Flow");
    }
    if (!activity.result) {
      return null;
    }
    return (
      <ChartRenderer result={activity.result} height={360} widgetId={widgetId} />
    );
  };

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
      title="Site Flow"
      subtitle={subtitle}
      className="dashboard-v2__chart-card vrm-card vrm-card--chart-panel"
      footer={footer}
      dateSelector={
        <div className="site-flow-card__controls">
          <select
            className="vrm-select"
            aria-label="Select Site Flow view"
            value={mode}
            onChange={(event) =>
              onModeChange(event.target.value as "activity" | "demographics")
            }
          >
            <option value="activity">Activity</option>
            <option value="demographics">Demographics</option>
          </select>
          <select
            className="vrm-select"
            aria-label="Select Site Flow timeframe"
            value={timeframe}
            onChange={(event) =>
              onTimeframeChange(event.target.value as SiteFlowTimeframe)
            }
          >
            {SITE_FLOW_TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {renderSiteFlowBody()}
    </Card>
  );
};

export default SiteFlowCard;
