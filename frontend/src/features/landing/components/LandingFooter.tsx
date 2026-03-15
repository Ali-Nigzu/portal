import React from "react";
import { landingCopy } from "../content";

type CookieConsentWindow = Window & {
  CookieConsent?: {
    renew?: () => void;
  };
};

const LandingFooter: React.FC = () => {
  const handleCookiePreferencesClick: React.MouseEventHandler<HTMLButtonElement> = () => {
    const cookieConsent = (window as CookieConsentWindow).CookieConsent;
    if (cookieConsent && typeof cookieConsent.renew === "function") {
      cookieConsent.renew();
    }
  };

  return (
    <footer className="landing-footer">
      <div className="landing-container landing-container--footer landing-footer-row">
        <div className="landing-footer-main" aria-label="Company and legal information">
          <div className="landing-footer-brand-column">
            <p className="landing-footer-copyright">{landingCopy.footer.copyright}</p>
            <nav className="landing-footer-links-column landing-footer-links-column-primary" aria-label="Primary legal links">
              <button type="button" className="landing-footer-link-item landing-footer-link-item-button">
                {landingCopy.footer.primaryLinks[0]}
              </button>
              <button type="button" className="landing-footer-link-item landing-footer-link-item-button">
                {landingCopy.footer.primaryLinks[1]}
              </button>
            </nav>
          </div>

          <nav className="landing-footer-links-column landing-footer-links-column-secondary" aria-label="Footer links">
            <button type="button" className="landing-footer-link-item landing-footer-link-item-button">
              {landingCopy.footer.secondaryLinks[0]}
            </button>
            <button type="button" className="landing-footer-link-item landing-footer-link-item-button" onClick={handleCookiePreferencesClick}>
              {landingCopy.footer.secondaryLinks[1]}
            </button>
            <button type="button" className="landing-footer-link-item landing-footer-link-item-button">
              {landingCopy.footer.secondaryLinks[2]}
            </button>
          </nav>

          <div className="landing-footer-legal-column">
            {landingCopy.footer.legalLines.map((line, index) => {
              if (index === 1) {
                const [beforeIco, afterIco] = line.split("ICO");
                return (
                  <p key={line}>
                    {beforeIco}
                    <a
                      href="https://ico.org.uk/"
                      target="_blank"
                      rel="noreferrer"
                      className="landing-footer-legal-link"
                    >
                      ICO
                    </a>
                    {afterIco}
                  </p>
                );
              }

              return <p key={line}>{line}</p>;
            })}
          </div>
        </div>

        <div className="landing-footer-social" aria-label="Social links">
          <a
            href="https://www.youtube.com"
            target="_blank"
            rel="noreferrer"
            aria-label={landingCopy.footer.socials.youtube}
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
            href="https://www.linkedin.com"
            target="_blank"
            rel="noreferrer"
            aria-label={landingCopy.footer.socials.linkedin}
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
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            aria-label={landingCopy.footer.socials.x}
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
};

export default LandingFooter;
