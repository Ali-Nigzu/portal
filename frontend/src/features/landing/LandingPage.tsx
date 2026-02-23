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
  const assuranceColumns = [
    {
      id: "privacy",
      title: "PRIVACY",
      items: ["No Personal Data", "Anonymous & Aggregated"],
    },
    {
      id: "operation",
      title: "OPERATION",
      items: ["Live Reporting", "99.9% Uptime"],
    },
    {
      id: "system",
      title: "SYSTEM",
      items: ["Plug & Play", "<1% Error"],
    },
  ] as const;
  const assuranceTree = {
    trunkX: 0,
    trunkY1: 2,
    rowHeight: 30,
    rowOffset: 5,
    dockX: 28,
  } as const;
  const assuranceBranchY1 = assuranceTree.rowOffset + (assuranceTree.rowHeight / 2);
  const assuranceBranchY2 = assuranceTree.rowOffset + (assuranceTree.rowHeight * 1.5);
  const assuranceTrunkY2 = assuranceTree.rowOffset + (assuranceTree.rowHeight * 1.5);
  const assuranceSvgHeight = assuranceTree.rowOffset + (assuranceTree.rowHeight * 2);

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
                className="btn landing-cta-btn landing-cta-create"
                onClick={(e) => e.preventDefault()}
              >
                {landingCopy.nav.actions.createAccount}
              </button>
              <button
                type="button"
                className="btn landing-cta-btn landing-cta-node-secondary"
                onClick={goToDemo}
              >
                {landingCopy.nav.actions.demo}
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
              <div className="landing-assurance-spec" aria-label="Operational assurances">
                {assuranceColumns.map((column) => (
                  <div className="assurance-col" data-testid={`assurance-col-${column.id}`} key={column.id}>
                    <div className="assurance-col-body">
                      <h3 className="assurance-col-title">
                        <span className="assurance-col-title-text">{column.title}</span>
                      </h3>
                      <div className="assurance-col-tree">
                        <svg className="assurance-tree-svg" aria-hidden="true" focusable="false" viewBox={`0 0 ${assuranceTree.dockX} ${assuranceSvgHeight}`} preserveAspectRatio="none">
                          <line className="assurance-tree-line assurance-tree-line--trunk" x1={assuranceTree.trunkX} y1={assuranceTree.trunkY1} x2={assuranceTree.trunkX} y2={assuranceTrunkY2} />
                          <line className="assurance-tree-line assurance-tree-line--branch" x1={assuranceTree.trunkX} y1={assuranceBranchY1} x2={assuranceTree.dockX} y2={assuranceBranchY1} />
                          <line className="assurance-tree-line assurance-tree-line--branch" x1={assuranceTree.trunkX} y1={assuranceBranchY2} x2={assuranceTree.dockX} y2={assuranceBranchY2} />
                        </svg>
                        <ul className="assurance-col-list">
                          {column.items.map((item) => (
                            <li className="assurance-col-item" key={item}>
                              <span className="assurance-col-item-dock" aria-hidden="true" />
                              <span className="assurance-col-item-text">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="assurance-cta-row" data-testid="assurance-row-cta">
                <button
                  type="button"
                  className="btn landing-cta-btn landing-cta-create landing-assurance-cta"
                  data-testid="assurance-create-account-cta"
                  onClick={(e) => { e.preventDefault(); }}
                >
                  CREATE ACCOUNT
                </button>
                <button
                  type="button"
                  className="btn landing-cta-btn landing-cta-node-secondary landing-assurance-cta"
                  data-testid="assurance-contact-us-cta"
                  onClick={(e) => { e.preventDefault(); }}
                >
                  CONTACT US
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
