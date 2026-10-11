import React from "react";
import HeaderStatusStrip, { type DashboardStatus } from "../../../components/HeaderStatusStrip";

type DashboardHeaderProps = {
  siteLabelOverride: string;
  status: DashboardStatus;
  metadataAction?: React.ReactNode;
};
const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  siteLabelOverride,
  status,
  metadataAction,
}) => {
  const siteLabel = siteLabelOverride;
  const Title = "h1";
  return (
    <header
      className={`dashboard-v2__header vrm-section vrm-section--header${" dashboard-v2__header--canonical"}`}
    >
      <div className="vrm-dashboard-header vrm-dashboard-header--desktop">
        <div className="vrm-dashboard-header-left">
          <div className="vrm-dashboard-identity">
            <Title className="vrm-dashboard-title">{siteLabel}</Title>
          </div>
        </div>
        {
          <div className="vrm-dashboard-header-right">
            <HeaderStatusStrip
              className="vrm-dashboard-header-meta"
              status={status}
              trailingAction={metadataAction}
            />
          </div>
        }
      </div>
      {true ? (
        <div
          className="vrm-dashboard-header-mobile"
          role="group"
          aria-label={"Dashboard status summary"}
        >
          <Title className="vrm-dashboard-header-mobile__site">
            {siteLabel}
          </Title>
          <div
            className="vrm-dashboard-header-mobile__divider"
            aria-hidden="true"
          />
          <div className="vrm-dashboard-header-mobile__status">
            <HeaderStatusStrip
              layout="mobile"
              status={status}
              trailingAction={metadataAction}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
};
export default DashboardHeader;
