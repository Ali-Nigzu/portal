import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import HeaderStatusStrip, { type DashboardStatus } from "../../../components/HeaderStatusStrip";
import { findSiteById, getStoredSiteId } from "../../../lib/sites";

type DashboardHeaderProps = {
  clientId?: string;
  siteLabelOverride?: string;
  mode?: "full" | "preview";
  isAuthenticatedView?: boolean;
  status?: DashboardStatus;
};

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  siteLabelOverride,
  mode = "full",
  isAuthenticatedView = false,
  status,
}) => {
  const { siteId } = useParams();
  const siteLabel = useMemo(() => {
    if (siteLabelOverride !== undefined) {
      return siteLabelOverride;
    }
    const resolvedSiteId = siteId ?? getStoredSiteId() ?? "all";
    return findSiteById(resolvedSiteId)?.label ?? "All Sites";
  }, [siteId, siteLabelOverride]);
  const Title = status ? "h1" : "div";

  return (
    <header className={`dashboard-v2__header vrm-section vrm-section--header${status ? " dashboard-v2__header--canonical" : ""}`}>
      <div className="vrm-dashboard-header vrm-dashboard-header--desktop">
        <div className="vrm-dashboard-header-left">
          <div className="vrm-dashboard-identity">
            <Title className="vrm-dashboard-title">{siteLabel}</Title>
          </div>
        </div>
        {mode === "full" ? (
          <div className="vrm-dashboard-header-right">
            <HeaderStatusStrip className="vrm-dashboard-header-meta" isAuthenticatedView={isAuthenticatedView} status={status} />
          </div>
        ) : null}
      </div>
      {mode === "full" ? (
        <div className="vrm-dashboard-header-mobile" role="group" aria-label={status ? "Dashboard status summary" : "Site status summary"}>
          <Title className="vrm-dashboard-header-mobile__site">{siteLabel}</Title>
          <div className="vrm-dashboard-header-mobile__divider" aria-hidden="true" />
          <div className="vrm-dashboard-header-mobile__status">
            <HeaderStatusStrip layout="mobile" isAuthenticatedView={isAuthenticatedView} status={status} />
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default DashboardHeader;
