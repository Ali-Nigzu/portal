import React, { useMemo } from "react";
import HeaderStatusStrip from "../../../components/HeaderStatusStrip";

type DashboardHeaderProps = {
  clientId?: string;
};

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ clientId }) => {
  const siteLabel = useMemo(() => {
    if (!clientId) {
      return "Eastside";
    }
    const normalized = clientId.toLowerCase();
    if (normalized === "client1") {
      return "Eastside";
    }
    if (normalized === "client2") {
      return "Southside";
    }
    return clientId;
  }, [clientId]);
  return (
  <header className="dashboard-v2__header vrm-section vrm-section--header">
    <div className="vrm-dashboard-header">
      <div className="vrm-dashboard-header-left">
        <div className="vrm-dashboard-avatar" aria-hidden="true" />
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
