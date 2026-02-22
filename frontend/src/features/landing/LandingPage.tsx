import React, { useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/LandingPage.css";
import { landingCopy } from "./content";
import LandingHeader from "./components/LandingHeader";
import LandingFooter from "./components/LandingFooter";
import SystemOverviewPreview from "./components/SystemOverviewPreview";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const goToDemo = () => {
    navigate("/demo");
  };

  const goToLogin = () => {
    navigate("/login");
  };

  const capabilityAxisItems = landingCopy.capabilities.items
    .filter((item) => item !== "Dwell time")
    .slice(0, 3);

  const deploymentAxisItems = [
    landingCopy.deployment.firstStep,
    landingCopy.deployment.secondStep,
    landingCopy.deployment.thirdStep,
  ];

  const romanAxisLabels = ["I", "II", "III"];
  const specSheetInnerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!specSheetInnerRef.current) {
      return;
    }

    const root = specSheetInnerRef.current;
    let rafId: number | null = null;

    const updateAssurancesLift = () => {
      if (!root) {
        return;
      }

      const bus = root.querySelector<SVGLineElement>('.landing-preview [data-testid="topology-bus"]');
      if (bus) {
        root.style.setProperty("--assurances-no-bus-lift", "0px");
        return;
      }

      const trafficModule = root.querySelector<HTMLElement>('.landing-preview [data-testid="traffic-split-module"]');
      const assurancesTitle = root.querySelector<HTMLElement>('[data-testid="assurance-col-privacy"] .assurance-col-title');

      if (!trafficModule || !assurancesTitle) {
        root.style.setProperty("--assurances-no-bus-lift", "0px");
        return;
      }

      const assurances = root.querySelector<HTMLElement>('.landing-assurances');
      if (!assurances) {
        root.style.setProperty("--assurances-no-bus-lift", "0px");
        return;
      }

      const trafficBottom = trafficModule.getBoundingClientRect().bottom;
      const titleTop = assurancesTitle.getBoundingClientRect().top;
      const currentGap = titleTop - trafficBottom;
      const currentLift = Number.parseFloat(window.getComputedStyle(assurances).marginTop) || 0;
      const targetGap = 12;
      const requiredLift = Math.max(-420, Math.min(80, currentLift + targetGap - currentGap));

      root.style.setProperty("--assurances-no-bus-lift", `${requiredLift}px`);
    };

    const scheduleUpdate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateAssurancesLift();
      });
    };

    scheduleUpdate();

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(root);

    const preview = root.querySelector('.landing-preview');
    const assurances = root.querySelector('.landing-assurances');
    if (preview) {
      resizeObserver.observe(preview);
    }
    if (assurances) {
      resizeObserver.observe(assurances);
    }

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-testid"],
    });

    window.addEventListener("resize", scheduleUpdate);
    const intervalId = window.setInterval(scheduleUpdate, 400);

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.clearInterval(intervalId);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return (
    <div className="landing-page">
      <LandingHeader
        onLogin={goToLogin}
      />

      <main>
        <section className="landing-hero-zone" aria-label="Hero zone">
          <div className="landing-container landing-hero-zone-grid">
            <section className="landing-hero" aria-labelledby="landing-hero-title">
              <div className="landing-hero-stack" data-align-anchor="hero-stack">
                <h1 id="landing-hero-title" aria-label="camOS">
                  <span aria-hidden="true" className="landing-hero-cam">cam</span>
                  <span aria-hidden="true" className="landing-hero-initial">OS</span>
                </h1>
                <p>{landingCopy.hero.supportLine}</p>
              </div>
            </section>

            <div className="landing-hero-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={goToDemo}
              >
                {landingCopy.nav.actions.demo}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={(e) => e.preventDefault()}
              >
                {landingCopy.nav.actions.createAccount}
              </button>
            </div>

            <section className="landing-axis-layout" aria-label="Platform capabilities and system deployment" data-align-anchor="axis-layout">
              <div className="landing-axis-matrix" data-align-anchor="axis-matrix">
                <h2 id="capabilities-title" className="landing-axis-cell landing-axis-cell-left landing-axis-cell-heading">Metrics</h2>
                <span className="landing-axis-cell landing-axis-cell-axis" aria-hidden="true" />
                <h2 id="deployment-title" className="landing-axis-cell landing-axis-cell-right landing-axis-cell-heading">Access</h2>

                {romanAxisLabels.map((label, index) => (
                  <React.Fragment key={label}>
                    <span className="landing-axis-cell landing-axis-cell-left">{capabilityAxisItems[index]}</span>
                    <span className="landing-axis-cell landing-axis-cell-axis landing-axis-roman" aria-hidden="true">{label}</span>
                    {index === 0 ? (
                      <span className="landing-axis-cell landing-axis-cell-right landing-axis-cell-right-action-row">
                        <button
                          type="button"
                          className="landing-axis-right-action"
                          onClick={(e) => e.preventDefault()}
                        >
                          <span className="landing-axis-right-action-label">{deploymentAxisItems[index]}</span>
                        </button>
                      </span>
                    ) : (
                      <span className="landing-axis-cell landing-axis-cell-right">{deploymentAxisItems[index]}</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="landing-spec-sheet" aria-label="Operational spec sheet">
          <div className="landing-container landing-spec-sheet-inner" ref={specSheetInnerRef}>
            <div className="landing-system-surface">
              <section className="landing-preview" aria-labelledby="live-preview-title">
                <div className="landing-section-head landing-section-head--sr-only">
                  <h2 id="live-preview-title">{landingCopy.livePreview.heading}</h2>
                  <p>{landingCopy.livePreview.description}</p>
                </div>
                <div className="landing-dashboard-preview">
                  <SystemOverviewPreview onAccessDemo={goToDemo} />
                </div>
              </section>
            </div>

            <section className="landing-assurances" aria-label="Assurances">
              <div className="landing-assurance-spec" aria-label="Operational assurances">
                <div className="assurance-col" data-testid="assurance-col-privacy">
                  <h3 className="assurance-col-title">PRIVACY</h3>
                  <ul className="assurance-col-list">
                    <li className="assurance-col-item">No Personal Data</li>
                    <li className="assurance-col-item">Anonymous &amp; Aggregated</li>
                  </ul>
                </div>
                <div className="assurance-col" data-testid="assurance-col-operation">
                  <h3 className="assurance-col-title">OPERATION</h3>
                  <ul className="assurance-col-list">
                    <li className="assurance-col-item">Live Reporting</li>
                    <li className="assurance-col-item">99.9% Uptime</li>
                  </ul>
                </div>
                <div className="assurance-col" data-testid="assurance-col-system">
                  <h3 className="assurance-col-title">SYSTEM</h3>
                  <ul className="assurance-col-list">
                    <li className="assurance-col-item">Plug &amp; Play</li>
                    <li className="assurance-col-item">&lt;1% Error</li>
                  </ul>
                </div>
              </div>
              <div className="assurance-cta-row" data-testid="assurance-row-cta">
                <button
                  type="button"
                  className="btn btn-secondary landing-assurance-cta"
                  data-testid="assurance-create-account-cta"
                  onClick={(e) => { e.preventDefault(); }}
                >
                  CREATE ACCOUNT
                </button>
              </div>
            </section>
          </div>
        </section>
      </main>

      <LandingFooter onLogin={goToLogin} />
    </div>
  );
};

export default LandingPage;
