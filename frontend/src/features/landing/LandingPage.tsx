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

  return (
    <div className="landing-page">
      <LandingHeader
        onDemo={goToDemo}
        onCreateAccount={scrollToSignUp}
        onLogin={goToLogin}
      />

      <main>
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-container landing-hero-inner">
            <h1 id="landing-hero-title">{landingCopy.hero.headline}</h1>
            <p>{landingCopy.hero.supportLine}</p>
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
          </div>
        </section>

        <section className="landing-spec-sheet" aria-label="Operational spec sheet">
          <div className="landing-container landing-spec-sheet-inner">
            <div className="landing-system-surface">
              <div className="landing-operational-grid">
                <section className="landing-capabilities" aria-labelledby="capabilities-title">
                  <h2 id="capabilities-title">{landingCopy.capabilities.heading}</h2>
                  <div className="landing-capabilities-content" data-align-anchor="capabilities">
                    <div className="landing-capability-rows" role="list" aria-label="Platform capabilities">
                    {landingCopy.capabilities.items.map((item, index) => (
                      <div key={item} className="landing-capability-row" role="listitem">
                        <span className="landing-capability-index" aria-hidden="true">
                          {(index + 1).toString().padStart(2, "0")}
                        </span>
                        <span>{item}</span>
                      </div>
                    ))}
                    </div>
                  </div>
                </section>

                <section className="landing-deployment" aria-labelledby="deployment-title">
                  <h2 id="deployment-title">{landingCopy.deployment.heading}</h2>
                  <div className="landing-deployment-content" data-align-anchor="deployment">
                    <ol className="landing-deployment-zigzag" aria-label="System deployment flow">
                      <li className="landing-deployment-step landing-deployment-step--one">
                        <span className="landing-deployment-step-index">01</span>
                        <span className="landing-deployment-step-label">{landingCopy.deployment.firstStep}</span>
                      </li>
                      <li className="landing-deployment-step landing-deployment-step--two">
                        <span className="landing-deployment-step-index">02</span>
                        <span className="landing-deployment-step-label">{landingCopy.deployment.secondStep}</span>
                      </li>
                      <li className="landing-deployment-step landing-deployment-step--three">
                        <span className="landing-deployment-step-index">03</span>
                        <span className="landing-deployment-step-label">{landingCopy.deployment.thirdStep}</span>
                      </li>
                    </ol>
                  </div>
                </section>
              </div>

              <section className="landing-preview" aria-labelledby="live-preview-title">
                <div className="landing-section-head landing-section-head--sr-only">
                  <h2 id="live-preview-title">{landingCopy.livePreview.heading}</h2>
                  <p>{landingCopy.livePreview.description}</p>
                </div>
                <div className="landing-dashboard-preview">
                  <SystemOverviewPreview />
                </div>
              </section>
            </div>

            <section className="landing-assurances" aria-labelledby="assurances-title">
              <h2 id="assurances-title">{landingCopy.assurances.heading}</h2>
              <div className="landing-assurance-matrix" role="list" aria-label="Operational assurances">
                {landingCopy.assurances.items.map((assurance) => (
                  <p key={assurance} role="listitem" className="landing-assurance-row">
                    {assurance}
                  </p>
                ))}
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
