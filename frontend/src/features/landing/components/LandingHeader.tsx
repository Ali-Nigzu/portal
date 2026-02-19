import React from "react";
import { companyLogoDataUri } from "../../../assets/companyLogo";
import { landingCopy } from "../content";

type LandingHeaderProps = {
  onLogin: () => void;
};

const LandingHeader: React.FC<LandingHeaderProps> = ({
  onLogin,
}) => (
  <header className="landing-header">
    <div className="landing-container landing-header-top">
      <div className="landing-brand" aria-label={landingCopy.brand.shortName}>
        <img
          src={companyLogoDataUri}
          alt="camOS Logo"
          className="landing-brand-logo"
        />
        <div className="landing-brand-name-wrap">
          <div className="landing-brand-short">{landingCopy.brand.shortName}</div>
          <div className="landing-brand-name">{landingCopy.brand.fullName}</div>
        </div>
      </div>

      <div className="landing-header-actions">
        <button type="button" className="btn btn-tertiary btn-sm" onClick={onLogin}>
          {landingCopy.nav.actions.login}
        </button>
      </div>
    </div>
  </header>
);

export default LandingHeader;
