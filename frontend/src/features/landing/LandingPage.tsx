import React from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/LandingPage.css";
import { useRegisterInterestForm } from "./hooks/useRegisterInterestForm";
import { landingCopy } from "./content";
import LandingHeader from "./components/LandingHeader";
import LandingFooter from "./components/LandingFooter";
import SystemOverviewPreview from "./components/SystemOverviewPreview";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    formData,
    isSubmitting,
    submitSuccess,
    submitError,
    setFormData,
    handleSubmit,
    resetSubmissionState,
  } = useRegisterInterestForm();

  const scrollToSignUp = () => {
    const section = document.getElementById("create-account");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

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
                onClick={scrollToSignUp}
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
                          onClick={scrollToSignUp}
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

            <section className="landing-assurances" aria-labelledby="assurances-title">
              <h2 id="assurances-title">{landingCopy.assurances.heading}</h2>
              <div className="landing-assurance-matrix" role="list" aria-label="Operational assurances">
                <div className="landing-assurance-row-group landing-assurance-row-group-r1" data-testid="assurance-row-1">
                  {landingCopy.assurances.items.slice(0, 3).map((assurance) => (
                    <p key={assurance} role="listitem" className="landing-assurance-row landing-assurance-row-small">
                      {assurance}
                    </p>
                  ))}
                </div>
                <div className="landing-assurance-row-group landing-assurance-row-group-r2" data-testid="assurance-row-2">
                  {landingCopy.assurances.items.slice(3, 5).map((assurance) => (
                    <p key={assurance} role="listitem" className="landing-assurance-row landing-assurance-row-medium">
                      {assurance}
                    </p>
                  ))}
                </div>
                <div className="landing-assurance-row-group landing-assurance-row-group-r3" data-testid="assurance-row-3">
                  <button
                    type="button"
                    className="btn btn-secondary landing-assurance-cta"
                    data-testid="assurance-create-account-cta"
                    onClick={scrollToSignUp}
                  >
                    {landingCopy.createAccount.button}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section id="create-account" className="landing-signup" aria-labelledby="create-account-title">
          <div className="landing-container landing-signup-wrap">
            <h2 id="create-account-title">{landingCopy.createAccount.heading}</h2>
            <p>{landingCopy.createAccount.line}</p>

            {submitSuccess ? (
              <div
                className="landing-status landing-status-success"
                role="status"
                aria-live="polite"
              >
                <p>Sign-up submitted.</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetSubmissionState}
                >
                  {landingCopy.createAccount.button}
                </button>
            </div>
            ) : (
              <form className="landing-signup-form" onSubmit={handleSubmit}>
                <div className="landing-form-grid">
                  <div className="landing-form-field">
                    <label htmlFor="name">Full name</label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="landing-form-field">
                    <label htmlFor="email">Work email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="landing-form-field">
                    <label htmlFor="company">Location name</label>
                    <input
                      id="company"
                      name="company"
                      type="text"
                      autoComplete="organization"
                      value={formData.company}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="landing-form-field">
                    <label htmlFor="phone">Phone (optional)</label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                {submitError ? (
                  <div
                    className="landing-status landing-status-error"
                    role="alert"
                    aria-live="assertive"
                  >
                    <p>{submitError}</p>
                  </div>
                ) : null}

                <button type="submit" className="btn btn-secondary" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : landingCopy.createAccount.button}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <LandingFooter onLogin={goToLogin} />
    </div>
  );
};

export default LandingPage;
