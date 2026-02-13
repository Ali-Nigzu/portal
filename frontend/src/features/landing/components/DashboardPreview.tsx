import React, { useMemo, useState } from "react";
import DashboardView from "../../dashboard/components/DashboardView";
import { createDashboardPreviewModel } from "../data/dashboardPreviewData";
import type { SiteFlowTimeframe } from "../../../lib/siteFlowTimeframe";

const DashboardPreview: React.FC = () => {
  const previewModel = useMemo(() => createDashboardPreviewModel(), []);
  const [siteFlowMode, setSiteFlowMode] = useState<"activity" | "demographics">("activity");
  const [siteFlowTimeframe, setSiteFlowTimeframe] = useState<SiteFlowTimeframe>("today");

  return (
    <div className="landing-dashboard-preview" role="region" aria-label="Live Platform Preview">
      <DashboardView
        mode="preview"
        siteLabel="All Sites"
        status="ready"
        error={null}
        kpiWidgets={previewModel.kpiWidgets}
        chartWidgets={previewModel.chartWidgets}
        gridColumns={previewModel.gridColumns}
        onRemoveWidget={() => undefined}
        siteFlowMode={siteFlowMode}
        onSiteFlowModeChange={setSiteFlowMode}
        siteFlowTimeframe={siteFlowTimeframe}
        onSiteFlowTimeframeChange={setSiteFlowTimeframe}
        siteFlowDemographics={previewModel.siteFlowDemographics}
        siteFlowActivity={previewModel.siteFlowActivity}
      />
      <div className="landing-preview-status-line" aria-live="polite">
        Interactive preview loaded from deterministic demo data.
      </div>
    </div>
  );
};

export default DashboardPreview;
