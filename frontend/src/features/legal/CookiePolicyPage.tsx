import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useIsPhoneLayout } from "../../common/hooks/useIsPhoneLayout";
import "./PrivacyPolicyPage.css";
import "./CookiePolicyPage.css";

// cd.js loads cdreport.js separately. Keep their insertion target intact even
// while this route is unmounted, so late responses cannot target a new instance.
// Park it hidden in the document so Cookiebot can still update consent labels.
let declarationHost: HTMLDivElement | undefined;

function getDeclarationHost() {
  if (!declarationHost) {
    declarationHost = document.createElement("div");
    const script = document.createElement("script");
    script.id = "CookieDeclaration";
    script.src = "https://consent.cookiebot.com/f87b8197-a211-42fb-9e93-64d8922f4987/cd.js";
    script.type = "text/javascript";
    script.async = true;
    script.onerror = () => {
      declarationHost!.dataset.failed = "true";
    };
    declarationHost.appendChild(script);
  }
  return declarationHost;
}

const CookiePolicyPage: React.FC = () => {
  const navigate = useNavigate();
  const isPhoneLayout = useIsPhoneLayout();
  const slot = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const host = getDeclarationHost();
    const update = () => {
      if (host.querySelector(".CookieDeclaration")) setStatus("ready");
      else if (host.dataset.failed) setStatus("failed");
    };
    const observer = new MutationObserver(update);
    observer.observe(host, { childList: true, subtree: true, attributes: true });
    host.hidden = false;
    slot.current!.appendChild(host);
    update();
    const timer = setTimeout(() => {
      if (!host.querySelector(".CookieDeclaration")) setStatus("failed");
    }, 20_000);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      host.hidden = true;
      document.body.appendChild(host);
    };
  }, []);

  const handleGoBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/", { replace: true });
  };

  return (
    <div className="privacy-page cookie-policy-page">
      {isPhoneLayout ? <AuthLogoHeader /> : <AuthTopBar />}
      <main className="privacy-page__main" aria-label="Cookie Policy content">
        <section className="privacy-page__document">
          <button type="button" className="privacy-page__back-link" onClick={handleGoBack}>
            <ArrowLeft size={18} aria-hidden="true" /><span>Go back</span>
          </button>
          <h1 className="privacy-page__title">Cookie Policy</h1>
          {status === "loading" ? <p role="status">Loading Cookie Policy…</p> : null}
          {status === "failed" ? (
            <div role="alert">
              <p>Cookie Policy is unavailable. Please try again.</p>
              <button type="button" className="privacy-page__back-link" onClick={() => window.location.reload()}>Reload page</button>
            </div>
          ) : null}
          <div className="privacy-page__body cookie-policy-page__declaration" ref={slot} hidden={status !== "ready"} />
        </section>
      </main>
      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default CookiePolicyPage;
