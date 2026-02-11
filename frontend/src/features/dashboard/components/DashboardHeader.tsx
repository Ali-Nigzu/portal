import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import HeaderStatusStrip from "../../../components/HeaderStatusStrip";
import { findSiteById, getStoredSiteId } from "../../../lib/sites";

type DashboardHeaderProps = {
  clientId?: string;
};

const DashboardHeader: React.FC<DashboardHeaderProps> = () => {
  const { siteId } = useParams();
  const siteLabel = useMemo(() => {
    const resolvedSiteId = siteId ?? getStoredSiteId() ?? "all";
    return findSiteById(resolvedSiteId)?.label ?? "All Sites";
  }, [siteId]);

  return (
    <header className="dashboard-v2__header vrm-section vrm-section--header">
      <div className="vrm-dashboard-header">
        <div className="vrm-dashboard-header-left">
          <div className="vrm-dashboard-identity">
            <div className="vrm-dashboard-title">{siteLabel}</div>
          </div>
        </div>
        <div className="vrm-dashboard-header-right">
          <HeaderStatusStrip className="vrm-dashboard-header-meta" />
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
