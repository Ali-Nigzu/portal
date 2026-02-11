import React from "react";
import { companyLogoDataUri } from "../../../assets/companyLogo";
import { landingCopy } from "../content";

type LandingHeaderProps = {
  onSignUp: () => void;
  onLogin: () => void;
};

const LandingHeader: React.FC<LandingHeaderProps> = ({ onSignUp, onLogin }) => (
  <header className="landing-header">
    <div className="landing-container landing-header-top">
      <div className="landing-brand" aria-label="camOS">
        <img
          src={companyLogoDataUri}
          alt="camOS Logo"
          className="landing-brand-logo"
        />
        <div>
          <div className="landing-brand-name">{landingCopy.brand.logoText}</div>
          <p className="landing-brand-tagline">{landingCopy.brand.tagline}</p>
        </div>
      </div>

      <div className="landing-header-actions">
        <button type="button" className="btn btn-secondary" onClick={onSignUp}>
          {landingCopy.nav.actions.signUp}
        </button>
        <button type="button" className="btn btn-tertiary" onClick={onLogin}>
          {landingCopy.nav.actions.login}
        </button>
      </div>
    </div>

    <div className="landing-container landing-header-bottom">
      <nav aria-label="Primary" className="landing-nav-links">
        {landingCopy.nav.anchors.map((anchor) => (
          <a key={anchor.href} href={anchor.href}>
            {anchor.label}
          </a>
        ))}
      </nav>
    </div>
  </header>
);

export default LandingHeader;
