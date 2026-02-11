import React from "react";
import { landingCopy } from "../content";

type LandingFooterProps = {
  onLogin: () => void;
};

const LandingFooter: React.FC<LandingFooterProps> = ({ onLogin }) => (
  <footer className="landing-footer">
    <div className="landing-container landing-footer-row">
      <div className="landing-footer-main">
        <p>{landingCopy.footer.legalLine1}</p>
        <p>{landingCopy.footer.legalLine2}</p>
        <p className="landing-footer-links">
          <span>Links: </span>
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
          <button
            type="button"
            onClick={onLogin}
            className="landing-footer-login-btn"
          >
            {landingCopy.footer.links[3]}
          </button>
        </p>
      </div>

      <div className="landing-footer-social" aria-label="Social links">
        <a
          href="#"
          aria-label={landingCopy.footer.socials.youtube}
          onClick={(event) => event.preventDefault()}
          className="landing-footer-social-link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M23 12.2c0-2-.2-4-.7-5.8-.2-.8-.9-1.5-1.7-1.7C18.8 4.2 12 4.2 12 4.2s-6.8 0-8.6.5c-.8.2-1.5.9-1.7 1.7C1.2 8.2 1 10.2 1 12.2s.2 4 .7 5.8c.2.8.9 1.5 1.7 1.7 1.8.5 8.6.5 8.6.5s6.8 0 8.6-.5c.8-.2 1.5-.9 1.7-1.7.5-1.8.7-3.8.7-5.8Zm-13.8 3.7V8.5l6.5 3.7-6.5 3.7Z"
              fill="currentColor"
            />
          </svg>
        </a>
        <a
          href="#"
          aria-label={landingCopy.footer.socials.linkedin}
          onClick={(event) => event.preventDefault()}
          className="landing-footer-social-link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6.9 8.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2ZM5 20V9.9h3.8V20H5Zm6 0V9.9h3.6v1.4h.1c.5-1 1.7-1.8 3.4-1.8 3.6 0 4.2 2.2 4.2 5.1V20h-3.8v-4.7c0-1.1 0-2.6-1.7-2.6s-2 1.2-2 2.5V20H11Z"
              fill="currentColor"
            />
          </svg>
        </a>
        <a
          href="#"
          aria-label={landingCopy.footer.socials.x}
          onClick={(event) => event.preventDefault()}
          className="landing-footer-social-link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M18.9 2H22l-6.8 7.8L23 22h-6.1l-4.8-6.4L6.5 22H3.4l7.2-8.2L1 2h6.2L11.6 8 18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z"
              fill="currentColor"
            />
          </svg>
        </a>
      </div>
    </div>
  </footer>
);

export default LandingFooter;
