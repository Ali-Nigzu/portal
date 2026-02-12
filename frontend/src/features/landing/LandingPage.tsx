import React from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/LandingPage.css";
import { useRegisterInterestForm } from "./hooks/useRegisterInterestForm";
import { landingCopy } from "./content";
import LandingHeader from "./components/LandingHeader";
import LandingFooter from "./components/LandingFooter";

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
    const section = document.getElementById("sign-up");
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
      <LandingHeader onLogin={goToLogin} />

      <main>
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-container landing-hero-inner">
            <h1 id="landing-hero-title">{landingCopy.hero.headline}</h1>
            <p>{landingCopy.hero.supportLine}</p>
            <div className="landing-hero-actions">
              <button
                type="button"
                className="btn btn-primary btn-stacked"
                onClick={goToDemo}
              >
                <span>Checkout</span>
                <span>Demo</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={scrollToSignUp}
              >
                {landingCopy.nav.actions.signUp}
              </button>
            </div>
          </div>
        </section>

        <section className="landing-content-band" aria-label="Landing information">
          <div className="landing-container">
            <article className="landing-middle-panel" aria-label="What you get and how it works">
              <div className="landing-middle-lanes">
                <section className="landing-lane landing-lane-left" aria-labelledby="what-you-get-title">
                  <h2 id="what-you-get-title" className="landing-lane-title">
                    {landingCopy.whatYouGet.heading}
                  </h2>

                  <div className="landing-spec-list" role="list" aria-label="What you get list">
                    {landingCopy.whatYouGet.items.map((item) => (
                      <div key={item} className="landing-spec-row landing-pill" role="listitem">
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-check-demo btn-stacked landing-inline-demo"
                    onClick={goToDemo}
                  >
                    <span>Checkout</span>
                    <span>Demo</span>
                  </button>
                </section>

                <section className="landing-lane landing-lane-right" aria-labelledby="how-it-works-title">
                  <h2 id="how-it-works-title" className="landing-lane-title">
                    {landingCopy.howItWorks.heading}
                  </h2>

                  <ol className="landing-stepper" aria-label="How it works flow">
                    <li className="landing-step landing-pill landing-step--highlight">
                      <span className="landing-step-index" aria-hidden="true">01</span>
                      <span className="landing-step-text">{landingCopy.howItWorks.firstStep}</span>
                    </li>
                    <li className="landing-step-connector" aria-hidden="true">→</li>
                    <li className="landing-step landing-pill">
                      <span className="landing-step-index" aria-hidden="true">02</span>
                      <span className="landing-step-text">{landingCopy.howItWorks.secondStep}</span>
                    </li>
                    <li className="landing-step-connector" aria-hidden="true">→</li>
                    <li className="landing-step landing-pill">
                      <span className="landing-step-index" aria-hidden="true">03</span>
                      <span className="landing-step-text">{landingCopy.howItWorks.thirdStep}</span>
                    </li>
                  </ol>

                  <div className="landing-assurance-grid" role="list" aria-label="Assurance points">
                    {[...landingCopy.howItWorks.trustPoints, ...landingCopy.howItWorks.facts].map((item) => (
                      <p key={item} role="listitem" className="landing-assurance-item landing-pill">
                        {item}
                      </p>
                    ))}
                  </div>
                </section>
              </div>
            </article>
          </div>
        </section>

        <section id="sign-up" className="landing-signup" aria-labelledby="sign-up-title">
          <div className="landing-container landing-signup-wrap">
            <h2 id="sign-up-title">{landingCopy.signUp.heading}</h2>
            <p>{landingCopy.signUp.line}</p>

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
                  {landingCopy.signUp.button}
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

                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : landingCopy.signUp.button}
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
