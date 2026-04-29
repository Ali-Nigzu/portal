import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import HeaderStatusStrip from "../../../components/HeaderStatusStrip";
import { findSiteById, getStoredSiteId } from "../../../lib/sites";

type DashboardHeaderProps = {
  clientId?: string;
  siteLabelOverride?: string;
  mode?: "full" | "preview";
  isAuthenticatedView?: boolean;
};

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  siteLabelOverride,
  mode = "full",
  isAuthenticatedView = false,
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
      <div className="vrm-dashboard-header vrm-dashboard-header--desktop">
        <div className="vrm-dashboard-header-left">
          <div className="vrm-dashboard-identity">
            <div className="vrm-dashboard-title">{siteLabel}</div>
          </div>
        </div>
        {mode === "full" ? (
          <div className="vrm-dashboard-header-right">
            <HeaderStatusStrip className="vrm-dashboard-header-meta" isAuthenticatedView={isAuthenticatedView} />
          </div>
        ) : null}
      </div>
      {mode === "full" ? (
        <div className="vrm-dashboard-header-mobile" role="group" aria-label="Site status summary">
          <div className="vrm-dashboard-header-mobile__site">{siteLabel}</div>
          <div className="vrm-dashboard-header-mobile__divider" aria-hidden="true" />
          <div className="vrm-dashboard-header-mobile__status">
            <HeaderStatusStrip layout="mobile" isAuthenticatedView={isAuthenticatedView} />
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default DashboardHeader;
