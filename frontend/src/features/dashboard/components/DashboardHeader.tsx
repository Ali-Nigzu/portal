import React from "react";
import HeaderStatusStrip from "../../../components/HeaderStatusStrip";

const DashboardHeader: React.FC = () => (
  <header className="dashboard-v2__header vrm-section vrm-section--header">
    <div className="vrm-dashboard-header">
      <div className="vrm-dashboard-header-left">
        <div className="vrm-dashboard-avatar" aria-hidden="true" />
        <div className="vrm-dashboard-identity">
          <div className="vrm-dashboard-title">Alis Pizzeria - Eastside</div>
        </div>
      </div>
      <div className="vrm-dashboard-header-right">
        <HeaderStatusStrip className="vrm-dashboard-header-meta" />
      </div>
    </div>
  </header>
);

export default DashboardHeader;
