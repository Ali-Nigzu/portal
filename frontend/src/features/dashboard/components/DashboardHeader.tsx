import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import HeaderStatusStrip from "../../../components/HeaderStatusStrip";
import { findSiteById, getStoredSiteId } from "../../../lib/sites";

type DashboardHeaderProps = {
  clientId?: string;
  siteLabelOverride?: string;
  mode?: "full" | "preview";
};

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  siteLabelOverride,
  mode = "full",
}) => {
  const { siteId } = useParams();
  const siteLabel = useMemo(() => {
    if (siteLabelOverride) {
      return siteLabelOverride;
    }
    const resolvedSiteId = siteId ?? getStoredSiteId() ?? "all";
    return findSiteById(resolvedSiteId)?.label ?? "All Sites";
  }, [siteId, siteLabelOverride]);

  return (
    <header className="dashboard-v2__header vrm-section vrm-section--header">
      <div className="vrm-dashboard-header">
        <div className="vrm-dashboard-header-left">
          <div className="vrm-dashboard-identity">
            <div className="vrm-dashboard-title">{siteLabel}</div>
          </div>
        </div>
        {mode === "full" ? (
          <div className="vrm-dashboard-header-right">
            <HeaderStatusStrip className="vrm-dashboard-header-meta" />
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default DashboardHeader;
