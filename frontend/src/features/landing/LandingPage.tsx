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


  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const goToFooterLegal = () => {
    const footer = document.querySelector(".landing-footer");
    footer?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const mobileQuickActions = [
    { key: "login", label: "Login", run: goToLogin },
    { key: "contact-us", label: "Contact Us", run: goToContact },
    { key: "terms", label: "Terms & Conditions", run: goToFooterLegal },
    { key: "privacy", label: "Privacy Policy", run: goToFooterLegal },
    { key: "cookies", label: "Cookies Policy", run: goToFooterLegal },
  ] as const;
  const mobilePrimaryActions = mobileQuickActions.filter(
    (item) => item.key === "login" || item.key === "contact-us",
  );
  const mobileLegalActions = mobileQuickActions.filter(
    (item) => item.key === "terms" || item.key === "privacy" || item.key === "cookies",
  );

  const openSearch = () => {
    setIsMobileMenuOpen(false);
    setMobileSearchQuery("");
    setIsMobileSearchOpen((prev) => !prev);
  };

  const closeSearch = () => {
    setMobileSearchQuery("");
    setIsMobileSearchOpen(false);
  };

  const openMenu = () => {
    closeSearch();
    setIsMobileMenuOpen((prev) => !prev);
  };

  const handleMobileAction = (run: () => void) => {
    closeSearch();
    setIsMobileMenuOpen(false);
    run();
  };

  const normalizedQuery = mobileSearchQuery.trim().toLowerCase();
  const filteredMobileQuickActions = normalizedQuery.length === 0
    ? []
    : mobileQuickActions.filter((item) => normalizedQuery.split("").some((char) => item.label.toLowerCase().includes(char)));

  const capabilityAxisItems = landingCopy.capabilities.items
    .filter((item) => item !== "Dwell time")
    .slice(0, 3);

  const deploymentAxisItems = [
    landingCopy.deployment.firstStep,
    landingCopy.deployment.secondStep,
    landingCopy.deployment.thirdStep,
  ];

  const romanAxisLabels = ["I", "II", "III"];
  const mobileAxisRows = [
    {
      key: "row-footfall",
      roman: "I",
      metric: ["Footfall", "&", "Occupancy"],
      access: ["Create Account", "@", "No Cost"],
      action: true,
    },
    {
      key: "row-site-flow",
      roman: "II",
      metric: ["Site Flow", "&", "Dwell"],
      access: ["Connect", "&", "Set Up"],
      action: false,
    },
    {
      key: "row-visitor",
      roman: "III",
      metric: ["Visitor", "Profile"],
      access: ["System", "Live"],
      action: false,
    },
  ] as const;
  const assuranceColumns = [
    {
      id: "operate",
      title: "OPERATE",
      anchor: "start",
      items: ["Live Reporting", "99.9% Uptime"],
    },
    {
      id: "private",
      title: "PRIVATE",
      anchor: "end",
      items: ["No Personal Data", "Anonymous & Aggregated"],
    },
    {
      id: "system",
      title: "SYSTEM",
      anchor: "start",
      items: ["Plug & Play", "<1% Error"],
    },
  ] as const;
  const assuranceTree = {
    trunkY1: 1,
    rowHeight: 29,
    rowOffset: 4,
    textOpticalCenterY: 13,
    dockXStart: 24,
    dockXEnd: 4,
    dockGap: 4,
  } as const;
  const assuranceBranchY1 = assuranceTree.rowOffset + assuranceTree.textOpticalCenterY;
  const assuranceBranchY2 = assuranceBranchY1 + assuranceTree.rowHeight;
  const assuranceLowerOpticalOffsetY = 1.8;
  const assuranceSvgHeight = assuranceTree.rowOffset + (assuranceTree.rowHeight * 2);
  const [assuranceLayoutById, setAssuranceLayoutById] = useState<Record<string, { trunkX: number; branchY1: number; branchY2: number }>>({});
  const [isMobileAssuranceLayout, setIsMobileAssuranceLayout] = useState(false);
  const assuranceAnchorRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const treeSvgRefs = useRef<Record<string, SVGSVGElement | null>>({});
  const assuranceItemTextRefs = useRef<Record<string, Array<HTMLSpanElement | null>>>({});
  const previewFitRef = useRef<HTMLDivElement | null>(null);
  const [previewFitWidth, setPreviewFitWidth] = useState<number | null>(null);
  const [mobileAxisRomanShiftByKey, setMobileAxisRomanShiftByKey] = useState<Record<string, number>>({});
  const mobileAxisRowRefs = useRef<Record<string, HTMLElement | null>>({});
  const mobileAxisMetricConnectorRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const mobileAxisAccessConnectorRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const mobileAxisMetricLineRefs = useRef<Record<string, Array<HTMLSpanElement | null>>>({});

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncIsMobile = () => {
      setIsMobileAssuranceLayout(mediaQuery.matches);
    };

    syncIsMobile();
    mediaQuery.addEventListener("change", syncIsMobile);

    return () => {
      mediaQuery.removeEventListener("change", syncIsMobile);
    };
  }, []);

  useLayoutEffect(() => {
    let frameId = 0;

    const measureTrunkAnchors = () => {
      setAssuranceLayoutById((prev) => {
        const next = { ...prev };
        let changed = false;

        assuranceColumns.forEach(({ id, anchor }) => {
          const activeAnchor = isMobileAssuranceLayout ? anchor : "start";
          const titleAnchor = assuranceAnchorRefs.current[id];
          const treeSvg = treeSvgRefs.current[id];

          if (!titleAnchor || !treeSvg) {
            return;
          }

          const titleAnchorRect = titleAnchor.getBoundingClientRect();
          const treeSvgRect = treeSvg.getBoundingClientRect();
          const viewBoxWidth = treeSvg.viewBox.baseVal.width || treeSvgRect.width;
          const viewBoxHeight = treeSvg.viewBox.baseVal.height || treeSvgRect.height;

          if (!treeSvgRect.width || !treeSvgRect.height || !viewBoxWidth || !viewBoxHeight) {
            return;
          }

          const anchorCenterX = titleAnchorRect.left + (titleAnchorRect.width / 2);
          const measuredTrunkX = (anchorCenterX - treeSvgRect.left) * (viewBoxWidth / treeSvgRect.width);
          const trunkX = activeAnchor === "end"
            ? Math.min(viewBoxWidth, Math.max(0, measuredTrunkX))
            : Math.min(viewBoxWidth, Math.max(0, measuredTrunkX));
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
          const titleAnchor = assuranceAnchorRefs.current[id];
          const treeSvg = treeSvgRefs.current[id];

          if (titleAnchor && resizeObserver) {
            resizeObserver.observe(titleAnchor);
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
  }, [assuranceBranchY1, assuranceBranchY2, assuranceColumns, assuranceLowerOpticalOffsetY, isMobileAssuranceLayout]);

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

  useLayoutEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        setIsMobileSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useLayoutEffect(() => {
    let frameId = 0;

    const measureAxisRomanAnchors = () => {
      if (!window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches) {
        return;
      }

      setMobileAxisRomanShiftByKey((prev) => {
        const next = { ...prev };
        let changed = false;

        mobileAxisRows.forEach((row) => {
          const rowEl = mobileAxisRowRefs.current[row.key];
          const metricConnectorEl = mobileAxisMetricConnectorRefs.current[row.key];
          const accessConnectorEl = mobileAxisAccessConnectorRefs.current[row.key];
          const metricLines = mobileAxisMetricLineRefs.current[row.key] ?? [];

          if (!rowEl) {
            return;
          }

          const rowRect = rowEl.getBoundingClientRect();
          const rowCenterY = rowRect.top + (rowRect.height / 2);

          let anchorCenterY: number | null = null;

          const connectorCenters = [metricConnectorEl, accessConnectorEl]
            .filter((node): node is HTMLSpanElement => Boolean(node))
            .map((node) => {
              const connectorRect = node.getBoundingClientRect();
              return connectorRect.top + (connectorRect.height / 2);
            });

          if (connectorCenters.length > 0) {
            const total = connectorCenters.reduce((acc, val) => acc + val, 0);
            anchorCenterY = total / connectorCenters.length;
          } else if (metricLines[0] && metricLines[1]) {
            const lineA = metricLines[0].getBoundingClientRect();
            const lineB = metricLines[1].getBoundingClientRect();
            const lineACenter = lineA.top + (lineA.height / 2);
            const lineBCenter = lineB.top + (lineB.height / 2);
            anchorCenterY = (lineACenter + lineBCenter) / 2;
          }

          if (anchorCenterY == null) {
            return;
          }

          const shift = Number((anchorCenterY - rowCenterY).toFixed(3));
          if (next[row.key] !== shift) {
            next[row.key] = shift;
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureAxisRomanAnchors);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleMeasure).catch(() => undefined);
    }

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleMeasure)
      : null;

    mobileAxisRows.forEach((row) => {
      const rowEl = mobileAxisRowRefs.current[row.key];
      if (rowEl && resizeObserver) {
        resizeObserver.observe(rowEl);
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <div className="landing-page">
      <LandingHeader
        onLogin={goToLogin}
        onMenuToggle={openMenu}
        isMenuOpen={isMobileMenuOpen}
      />

      <div className="landing-mobile-header-overlays" aria-live="polite">
        {isMobileSearchOpen && (
          <>
            <button
              type="button"
              className="landing-mobile-search-backdrop"
              aria-label="Close search"
              onClick={closeSearch}
            />
            <div className="landing-mobile-search-panel" id="landing-mobile-search-panel" role="dialog" aria-label="Mobile search">
              <button type="button" className="landing-mobile-search-close" onClick={closeSearch} aria-label="Close search">×</button>
              <input
                id="landing-mobile-search-input"
                type="search"
                value={mobileSearchQuery}
                onChange={(event) => setMobileSearchQuery(event.target.value)}
                placeholder="Search actions"
                autoFocus
              />
              {normalizedQuery.length > 0 && (
                <div className="landing-mobile-search-results" role="listbox" aria-label="Search results">
                  {filteredMobileQuickActions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="landing-mobile-search-result"
                      onClick={() => handleMobileAction(item.run)}
                    >
                      {item.label}
                    </button>
                  ))}
                  {filteredMobileQuickActions.length === 0 && (
                    <p className="landing-mobile-search-empty">No matches</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {isMobileMenuOpen && <button type="button" className="landing-mobile-drawer-backdrop" aria-label="Close menu" onClick={() => setIsMobileMenuOpen(false)} />}
        <aside className={`landing-mobile-drawer${isMobileMenuOpen ? " is-open" : ""}`} id="landing-mobile-drawer" aria-label="Mobile menu" role="dialog" aria-modal={isMobileMenuOpen}>
          <div className="landing-mobile-drawer-head">
            <button type="button" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu">×</button>
          </div>
          <nav className="landing-mobile-drawer-list" aria-label="Mobile quick links">
            {mobilePrimaryActions.map((item) => (
              <button key={`drawer-${item.key}`} type="button" onClick={() => handleMobileAction(item.run)}>
                {item.label}
              </button>
            ))}
          </nav>
          {mobileLegalActions.length ? (
            <nav className="landing-mobile-drawer-list landing-mobile-drawer-list--footer" aria-label="Mobile legal links">
              {mobileLegalActions.map((item) => (
                <button key={`drawer-legal-${item.key}`} type="button" onClick={() => handleMobileAction(item.run)}>
                  {item.label}
                </button>
              ))}
            </nav>
          ) : null}
        </aside>
      </div>

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
              {mobileAxisRows.map((row) => (
                <article
                  className="landing-axis-mobile-row"
                  role="listitem"
                  key={row.key}
                  ref={(node) => {
                    mobileAxisRowRefs.current[row.key] = node;
                  }}
                >
                  <div className="landing-axis-mobile-item-metric landing-axis-mobile-stack landing-axis-mobile-stack-metric" aria-label={row.metric.join(" ")}>
                    {row.metric.map((line, index) => (
                      <span
                        key={`${row.key}-metric-${line}`}
                        className={line === "&" || line === "@" ? "landing-axis-mobile-stack-line landing-axis-mobile-connector" : "landing-axis-mobile-stack-line"}
                        ref={(node) => {
                          const list = mobileAxisMetricLineRefs.current[row.key] ?? [];
                          list[index] = node;
                          mobileAxisMetricLineRefs.current[row.key] = list;
                          if (line === "&" || line === "@") {
                            mobileAxisMetricConnectorRefs.current[row.key] = node;
                          }
                        }}
                      >
                        {line}
                      </span>
                    ))}
                  </div>

                  <span
                    className="landing-axis-mobile-item-roman"
                    aria-hidden="true"
                    style={{ "--roman-shift-y": `${mobileAxisRomanShiftByKey[row.key] ?? 0}px` } as React.CSSProperties}
                  >
                    {row.roman}
                  </span>

                  {row.action ? (
                    <div className="landing-axis-mobile-item-access landing-axis-mobile-stack landing-axis-mobile-stack-access" aria-label={row.access.join(" ")}>
                      {row.access.map((line, index) => {
                        const lineClassName = line === "&" || line === "@"
                          ? "landing-axis-mobile-stack-line landing-axis-mobile-connector"
                          : index === 0
                            ? "landing-axis-mobile-stack-line landing-axis-mobile-stack-line-cta"
                            : "landing-axis-mobile-stack-line";

                        return index === 0 ? (
                          <button
                            key={`${row.key}-access-${line}`}
                            type="button"
                            className="landing-axis-mobile-stack-action-line"
                            onClick={goToCreateAccount}
                            aria-label="Create Account"
                          >
                            <span className={lineClassName}>{line}</span>
                          </button>
                        ) : (
                          <span
                            key={`${row.key}-access-${line}`}
                            className={lineClassName}
                            ref={(node) => {
                              if (line === "&" || line === "@") {
                                mobileAxisAccessConnectorRefs.current[row.key] = node;
                              }
                            }}
                          >
                            {line}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="landing-axis-mobile-item-access landing-axis-mobile-stack landing-axis-mobile-stack-access" aria-label={row.access.join(" ")}>
                      {row.access.map((line) => (
                        <span
                          key={`${row.key}-access-${line}`}
                          className={line === "&" || line === "@" ? "landing-axis-mobile-stack-line landing-axis-mobile-connector" : "landing-axis-mobile-stack-line"}
                          ref={(node) => {
                            if (line === "&" || line === "@") {
                              mobileAxisAccessConnectorRefs.current[row.key] = node;
                            }
                          }}
                        >
                          {line}
                        </span>
                      ))}
                    </div>
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
                        const middle = column.title.slice(1, -1);
                        const lastLetter = column.title.slice(-1);
                        const columnLayout = assuranceLayoutById[column.id];
                        const trunkX = columnLayout?.trunkX ?? 0;
                        const branchY1 = columnLayout?.branchY1 ?? assuranceBranchY1;
                        const branchY2 = columnLayout?.branchY2 ?? assuranceBranchY2;
                        const trunkY2 = branchY2;
                        const isEndAnchored = isMobileAssuranceLayout && column.anchor === "end";
                        const dockX = isEndAnchored
                          ? assuranceTree.dockXEnd
                          : assuranceTree.dockXStart;

                        return (
                          <>
                      <h3 className="assurance-col-title">
                        <span className="assurance-col-title-text">
                          {isEndAnchored ? (
                            <>
                              <span>{firstLetter}{middle}</span>
                              <span
                                className="assurance-col-title-anchor assurance-col-title-last-letter"
                                ref={(node) => {
                                  assuranceAnchorRefs.current[column.id] = node;
                                }}
                              >
                                {lastLetter}
                              </span>
                            </>
                          ) : (
                            <>
                              <span
                                className="assurance-col-title-anchor assurance-col-title-first-letter"
                                ref={(node) => {
                                  assuranceAnchorRefs.current[column.id] = node;
                                }}
                              >
                                {firstLetter}
                              </span>
                              <span>{column.title.slice(1)}</span>
                            </>
                          )}
                        </span>
                      </h3>
                      <div className="assurance-col-tree" data-anchor={isEndAnchored ? "end" : "start"}>
                        <svg
                          className="assurance-tree-svg"
                          aria-hidden="true"
                          focusable="false"
                          viewBox={`0 0 ${assuranceTree.dockXStart + assuranceTree.dockGap} ${assuranceSvgHeight}`}
                          preserveAspectRatio="none"
                          ref={(node) => {
                            treeSvgRefs.current[column.id] = node;
                          }}
                        >
                          <line className="assurance-tree-line assurance-tree-line--trunk" x1={trunkX} y1={assuranceTree.trunkY1} x2={trunkX} y2={trunkY2} />
                          <line
                            className="assurance-tree-line assurance-tree-line--branch"
                            x1={trunkX}
                            y1={branchY1}
                            x2={dockX}
                            y2={branchY1}
                          />
                          <line
                            className="assurance-tree-line assurance-tree-line--branch"
                            x1={trunkX}
                            y1={branchY2}
                            x2={dockX}
                            y2={branchY2}
                          />
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
