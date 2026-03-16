import React from "react";
import camOSLogo from "../../../assets/Untitled design (4).svg";
import { landingCopy } from "../content";

type LandingHeaderProps = {
  onLogin: () => void;
};

const LandingHeader: React.FC<LandingHeaderProps> = ({
  onLogin,
}) => (
  <header className="landing-header">
    <div className="landing-container landing-header-top">
      <div className="landing-header-left">
        <div className="landing-brand" aria-label={landingCopy.brand.shortName}>
          <img
            src={camOSLogo}
            alt="camOS Logo"
            className="landing-brand-logo"
          />
          <div className="landing-brand-name-wrap">
            <div className="landing-brand-name">{landingCopy.brand.fullName}</div>
          </div>
        </div>
      </div>

      <div className="landing-header-actions">
        <button type="button" className="btn landing-cta-btn landing-cta-node-secondary landing-login-cta" onClick={onLogin}>
          {landingCopy.nav.actions.login}
        </button>

        <div className="landing-header-utility-icons" aria-label="Header utilities">
          <button type="button" className="landing-header-icon-btn" aria-label="Search">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <line x1="16" y1="16" x2="21" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="landing-header-icon-btn" aria-label="Account">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="8" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5.5 19.2c1.5-2.8 4-4.2 6.5-4.2s5 1.4 6.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="landing-header-icon-btn" aria-label="Menu">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </header>
);

export default LandingHeader;
