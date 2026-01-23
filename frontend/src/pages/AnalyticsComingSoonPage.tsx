import React from "react";

const AnalyticsComingSoonPage: React.FC = () => (
  <div className="vrm-section vrm-section--header">
    <div className="vrm-page-header">
      <h1 className="vrm-page-title">Analytics</h1>
      <div className="vrm-status vrm-status-warning" aria-label="Coming soon">
        <span className="vrm-status-dot" aria-hidden="true" />
        Coming soon
      </div>
    </div>
    <div className="vrm-card vrm-card--spaced">
      <div className="vrm-card-body">
        <p className="vrm-page-lede">
          We’re building a new analytics experience. Check back soon for updates.
        </p>
      </div>
    </div>
  </div>
);

export default AnalyticsComingSoonPage;
