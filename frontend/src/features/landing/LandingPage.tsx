import React from "react";
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
          <div className="landing-container landing-spec-sheet-inner">
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
              <div className="landing-assurance-matrix" role="list" aria-label="Operational assurances">
                <div role="listitem" className="landing-assurance-item landing-assurance-r1 assurance-r1-1" data-testid="assurance-r1-1">PRIVATE</div>
                <div role="listitem" className="landing-assurance-item landing-assurance-r1 assurance-r1-2" data-testid="assurance-r1-2">OPERATIONAL</div>
                <div role="listitem" className="landing-assurance-item landing-assurance-r1 assurance-r1-3" data-testid="assurance-r1-3">SYSTEM</div>
                <div role="listitem" className="landing-assurance-item landing-assurance-r1 assurance-r1-4" data-testid="assurance-r1-4">TRANSPARENT</div>

                <div role="listitem" className="landing-assurance-item landing-assurance-r2 assurance-r2-1" data-testid="assurance-r2-1">Anonymous &amp; Aggregated</div>
                <div role="listitem" className="landing-assurance-item landing-assurance-r2 assurance-r2-2" data-testid="assurance-r2-2">Plug &amp; Play</div>
                <div role="listitem" className="landing-assurance-item landing-assurance-r2 assurance-r2-3" data-testid="assurance-r2-3">Live Reporting</div>

                <div role="listitem" className="landing-assurance-item landing-assurance-r3 assurance-r3-1" data-testid="assurance-r3-1">No Personal Data</div>
                <div role="listitem" className="landing-assurance-item landing-assurance-r3 assurance-r3-2" data-testid="assurance-r3-2">&lt;1% Error</div>

                <div className="assurance-cta-row" data-testid="assurance-row-4">
                  <button
                    type="button"
                    className="btn btn-secondary landing-assurance-cta"
                    data-testid="assurance-create-account-cta"
                    onClick={(e) => { e.preventDefault(); }}
                  >
                    CREATE ACCOUNT
                  </button>
                </div>
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
