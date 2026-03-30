import React from "react";
import { useNavigate } from "react-router-dom";
import { landingCopy } from "../content";

type CookieConsentWindow = Window & {
  CookieConsent?: {
    renew?: () => void;
  };
};

const LandingFooter: React.FC = () => {
  const navigate = useNavigate();
  const [termsAndConditions, privacyPolicy] = landingCopy.footer.primaryLinks;
  const [cookiePolicy, cookiePreferences, contactUs] = landingCopy.footer.secondaryLinks;

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
            <p className="landing-footer-copyright">
              <span className="landing-footer-copyright-prefix">© 2026 </span>
              <span className="landing-footer-copyright-brand">Camera Operating Systems</span>
            </p>
            <nav className="landing-footer-links-column landing-footer-links-column-primary" aria-label="Primary legal links">
              <button type="button" className="landing-footer-link-item landing-footer-link-item-button">
                {termsAndConditions}
              </button>
              <button type="button" className="landing-footer-link-item landing-footer-link-item-button">
                {privacyPolicy}
              </button>
            </nav>
          </div>

          <nav className="landing-footer-links-column landing-footer-links-column-secondary" aria-label="Footer links">
            <button
              type="button"
              className="landing-footer-link-item landing-footer-link-item-button landing-footer-link-item-cookie-preferences"
              onClick={handleCookiePreferencesClick}
            >
              {cookiePreferences}
            </button>
            <button type="button" className="landing-footer-link-item landing-footer-link-item-button">
              {cookiePolicy}
            </button>
            <button
              type="button"
              className="landing-footer-link-item landing-footer-link-item-button"
              onClick={() => navigate("/contact")}
            >
              {contactUs}
            </button>
          </nav>

          <div className="landing-footer-mobile-top-links" aria-label="Mobile legal links">
            <span className="landing-footer-mobile-top-item landing-footer-mobile-top-item-year">© 2026</span>
            <span className="landing-footer-mobile-top-item landing-footer-mobile-top-item-brand">Camera Operating Systems</span>
            <button type="button" className="landing-footer-link-item landing-footer-link-item-button landing-footer-mobile-top-link landing-footer-mobile-top-link-terms">
              {termsAndConditions}
            </button>
            <button
              type="button"
              className="landing-footer-link-item landing-footer-link-item-button landing-footer-link-item-cookie-preferences landing-footer-mobile-top-link landing-footer-mobile-top-link-cookie-preferences"
              onClick={handleCookiePreferencesClick}
            >
              {cookiePreferences}
            </button>
            <button type="button" className="landing-footer-link-item landing-footer-link-item-button landing-footer-mobile-top-link landing-footer-mobile-top-link-cookie-policy">
              {cookiePolicy}
            </button>
            <button type="button" className="landing-footer-link-item landing-footer-link-item-button landing-footer-mobile-top-link landing-footer-mobile-top-link-privacy">
              {privacyPolicy}
            </button>
            <button
              type="button"
              className="landing-footer-link-item landing-footer-link-item-button landing-footer-mobile-top-link landing-footer-mobile-top-link-contact"
              onClick={() => navigate("/contact")}
            >
              {contactUs}
            </button>
          </div>

          <div className="landing-footer-legal-column">
            {landingCopy.footer.legalLines.map((line) => <p key={line}>{line}</p>)}
          </div>
        </div>

        <div className="landing-footer-social" aria-label="Social links">
          <a
            href="https://www.youtube.com/@CameraOperatingSystems"
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
            href="https://www.linkedin.com/company/camera-operating-systems"
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
            href="https://x.com/cam_O_S"
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
