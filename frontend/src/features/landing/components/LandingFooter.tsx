import React from "react";
import { landingCopy } from "../content";

type LandingFooterProps = {
  onLogin: () => void;
};

const LandingFooter: React.FC<LandingFooterProps> = ({ onLogin }) => (
  <footer className="landing-footer">
    <div className="landing-container landing-footer-inner">
      <p>{landingCopy.footer.legalLine1}</p>
      <p>{landingCopy.footer.legalLine2}</p>
      <p className="landing-footer-links">
        <a href="#" onClick={(event) => event.preventDefault()}>
          {landingCopy.footer.links[0]}
        </a>
        <span aria-hidden="true"> · </span>
        <a href="#" onClick={(event) => event.preventDefault()}>
          {landingCopy.footer.links[1]}
        </a>
        <span aria-hidden="true"> · </span>
        <a href="#" onClick={(event) => event.preventDefault()}>
          {landingCopy.footer.links[2]}
        </a>
        <span aria-hidden="true"> · </span>
        <button type="button" onClick={onLogin} className="landing-footer-login-btn">
          {landingCopy.footer.links[3]}
        </button>
      </p>
    </div>
  </footer>
);

export default LandingFooter;
