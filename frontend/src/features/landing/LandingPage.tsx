import React, { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/LandingPage.css";
import { landingCopy } from "./content";
import LandingHeader from "./components/LandingHeader";
import LandingFooter from "./components/LandingFooter";
import SystemOverviewPreview from "./components/SystemOverviewPreview";
import camOSLogo from "../../assets/Untitled design (4).svg";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const goToDemo = () => {
    navigate("/demo");
  };

  const goToLogin = () => {
    navigate("/login");
  };

  const goToCreateAccount = () => {
    navigate("/create-account");
  };

  const goToContact = () => {
    navigate("/contact");
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
    trunkY1: 1,
    rowHeight: 29,
    rowOffset: 4,
    textOpticalCenterY: 13,
    dockX: 28,
    dockGap: 4,
  } as const;
  const assuranceBranchY1 = assuranceTree.rowOffset + assuranceTree.textOpticalCenterY;
  const assuranceBranchY2 = assuranceBranchY1 + assuranceTree.rowHeight;
  const assuranceLowerOpticalOffsetY = 1.8;
  const assuranceSvgHeight = assuranceTree.rowOffset + (assuranceTree.rowHeight * 2);
  const [assuranceLayoutById, setAssuranceLayoutById] = useState<Record<string, { trunkX: number; branchY1: number; branchY2: number }>>({});
  const firstLetterRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const treeSvgRefs = useRef<Record<string, SVGSVGElement | null>>({});
  const assuranceItemTextRefs = useRef<Record<string, Array<HTMLSpanElement | null>>>({});
  const previewFitRef = useRef<HTMLDivElement | null>(null);
  const [previewFitWidth, setPreviewFitWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    let frameId = 0;

    const measureTrunkAnchors = () => {
      setAssuranceLayoutById((prev) => {
        const next = { ...prev };
        let changed = false;

        assuranceColumns.forEach(({ id }) => {
          const firstLetter = firstLetterRefs.current[id];
          const treeSvg = treeSvgRefs.current[id];

          if (!firstLetter || !treeSvg) {
            return;
          }

          const firstLetterRect = firstLetter.getBoundingClientRect();
          const treeSvgRect = treeSvg.getBoundingClientRect();
          const viewBoxWidth = treeSvg.viewBox.baseVal.width || treeSvgRect.width;
          const viewBoxHeight = treeSvg.viewBox.baseVal.height || treeSvgRect.height;

          if (!treeSvgRect.width || !treeSvgRect.height || !viewBoxWidth || !viewBoxHeight) {
            return;
          }

          const firstLetterCenterX = firstLetterRect.left + (firstLetterRect.width / 2);
          const trunkX = (firstLetterCenterX - treeSvgRect.left) * (viewBoxWidth / treeSvgRect.width);
          const normalizedTrunkX = Number(trunkX.toFixed(3));

          const textNodes = assuranceItemTextRefs.current[id] ?? [];
          const branchCenters = textNodes
            .slice(0, 2)
            .map((node) => {
              if (!node) {
                return null;
              }
              const itemRect = node.getBoundingClientRect();
              const itemCenterY = itemRect.top + (itemRect.height / 2);
              return ((itemCenterY - treeSvgRect.top) * (viewBoxHeight / treeSvgRect.height)) + assuranceLowerOpticalOffsetY;
            });

          const normalizedBranchY1 = Number((branchCenters[0] ?? assuranceBranchY1).toFixed(3));
          const normalizedBranchY2 = Number((branchCenters[1] ?? assuranceBranchY2).toFixed(3));
          const current = next[id];

          if (
            !current
            || current.trunkX !== normalizedTrunkX
            || current.branchY1 !== normalizedBranchY1
            || current.branchY2 !== normalizedBranchY2
          ) {
            next[id] = {
              trunkX: normalizedTrunkX,
              branchY1: normalizedBranchY1,
              branchY2: normalizedBranchY2,
            };
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureTrunkAnchors);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleMeasure).catch(() => undefined);
    }

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleMeasure)
      : null;

    assuranceColumns.forEach(({ id }) => {
      const firstLetter = firstLetterRefs.current[id];
      const treeSvg = treeSvgRefs.current[id];

      if (firstLetter && resizeObserver) {
        resizeObserver.observe(firstLetter);
      }

      if (treeSvg && resizeObserver) {
        resizeObserver.observe(treeSvg);
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const target = previewFitRef.current;
    if (!target) {
      return;
    }

    const update = () => {
      const measured = target.clientWidth;
      if (measured > 0) {
        setPreviewFitWidth((prev) => (prev === measured ? prev : measured));
      }
    };

    update();
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => update())
      : null;
    observer?.observe(target);

    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
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
                <img src={camOSLogo} alt="camOS mark" className="landing-hero-mobile-logo" />
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
                onClick={goToCreateAccount}
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

            <section className="landing-axis-layout landing-axis-layout--desktop" aria-label="Platform capabilities and system deployment" data-align-anchor="axis-layout">
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
                          onClick={goToCreateAccount}
                        >
                          <span className="landing-axis-right-action-label">
                            <span className="landing-axis-right-action-highlight">CREATE ACCOUNT</span>
                            <span className="landing-axis-right-action-tail">@ No Cost</span>
                          </span>
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


        <section className="landing-axis-layout-mobile" aria-label="Platform capabilities and system deployment">
          <div className="landing-container landing-axis-mobile-inner">
            <header className="landing-axis-mobile-headings" aria-hidden="true">
              <h2>Metrics</h2>
              <h2>Access</h2>
            </header>
            <div className="landing-axis-mobile-list" role="list">
              {romanAxisLabels.map((label, index) => (
                <article className="landing-axis-mobile-row" role="listitem" key={`mobile-${label}`}>
                  <p className="landing-axis-mobile-item-metric">{capabilityAxisItems[index]}</p>
                  <span className="landing-axis-mobile-item-roman" aria-hidden="true">{label}</span>
                  {index === 0 ? (
                    <button
                      type="button"
                      className="landing-axis-right-action landing-axis-mobile-item-access landing-axis-mobile-item-access-action"
                      onClick={goToCreateAccount}
                    >
                      <span className="landing-axis-right-action-label">
                        <span className="landing-axis-right-action-highlight">CREATE ACCOUNT</span>
                        <span className="landing-axis-right-action-tail">@ No Cost</span>
                      </span>
                    </button>
                  ) : (
                    <p className="landing-axis-mobile-item-access">{deploymentAxisItems[index]}</p>
                  )}
                </article>
              ))}
            </div>
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
                <div
                  className="landing-dashboard-preview"
                  ref={previewFitRef}
                  style={previewFitWidth ? ({ "--preview-fit-width": `${previewFitWidth}px` } as React.CSSProperties) : undefined}
                >
                  <SystemOverviewPreview onAccessDemo={goToDemo} />
                </div>
              </section>
            </div>

            <section className="landing-assurances" aria-label="Assurances">
              <div className="landing-assurance-spec" aria-label="Operational assurances">
                {assuranceColumns.map((column) => (
                  <div className="assurance-col" data-testid={`assurance-col-${column.id}`} key={column.id}>
                    <div className="assurance-col-body">
                      {(() => {
                        const firstLetter = column.title.slice(0, 1);
                        const remainder = column.title.slice(1);
                        const columnLayout = assuranceLayoutById[column.id];
                        const trunkX = columnLayout?.trunkX ?? 0;
                        const branchY1 = columnLayout?.branchY1 ?? assuranceBranchY1;
                        const branchY2 = columnLayout?.branchY2 ?? assuranceBranchY2;
                        const trunkY2 = branchY2;

                        return (
                          <>
                      <h3 className="assurance-col-title">
                        <span className="assurance-col-title-text">
                          <span
                            className="assurance-col-title-first-letter"
                            ref={(node) => {
                              firstLetterRefs.current[column.id] = node;
                            }}
                          >
                            {firstLetter}
                          </span>
                          <span>{remainder}</span>
                        </span>
                      </h3>
                      <div className="assurance-col-tree">
                        <svg
                          className="assurance-tree-svg"
                          aria-hidden="true"
                          focusable="false"
                          viewBox={`0 0 ${assuranceTree.dockX} ${assuranceSvgHeight}`}
                          preserveAspectRatio="none"
                          ref={(node) => {
                            treeSvgRefs.current[column.id] = node;
                          }}
                        >
                          <line className="assurance-tree-line assurance-tree-line--trunk" x1={trunkX} y1={assuranceTree.trunkY1} x2={trunkX} y2={trunkY2} />
                          <line className="assurance-tree-line assurance-tree-line--branch" x1={trunkX} y1={branchY1} x2={assuranceTree.dockX - assuranceTree.dockGap} y2={branchY1} />
                          <line className="assurance-tree-line assurance-tree-line--branch" x1={trunkX} y1={branchY2} x2={assuranceTree.dockX - assuranceTree.dockGap} y2={branchY2} />
                        </svg>
                        <ul className="assurance-col-list">
                          {column.items.map((item, itemIndex) => (
                            <li className="assurance-col-item" key={item}>
                              <span className="assurance-col-item-dock" aria-hidden="true" />
                              <span
                                className="assurance-col-item-text"
                                ref={(node) => {
                                  if (!assuranceItemTextRefs.current[column.id]) {
                                    assuranceItemTextRefs.current[column.id] = [];
                                  }
                                  assuranceItemTextRefs.current[column.id][itemIndex] = node;
                                }}
                              >
                                {item}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
              <div className="assurance-cta-row" data-testid="assurance-row-cta">
                <button
                  type="button"
                  className="btn landing-cta-btn landing-cta-create landing-assurance-cta"
                  data-testid="assurance-create-account-cta"
                  onClick={goToCreateAccount}
                >
                  CREATE ACCOUNT
                </button>
                <button
                  type="button"
                  className="btn landing-cta-btn landing-cta-node-secondary landing-assurance-cta"
                  data-testid="assurance-contact-us-cta"
                  onClick={goToContact}
                >
                  CONTACT US
                </button>
              </div>
            </section>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default LandingPage;
