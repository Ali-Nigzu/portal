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

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
        onTryDemo={goToDemo}
        onSignUp={scrollToSignUp}
        onLogin={goToLogin}
      />

      <main>
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-container landing-hero-inner">
            <h1 id="landing-hero-title">{landingCopy.hero.headline}</h1>
            <p>{landingCopy.hero.supportLine}</p>
            <div className="landing-hero-actions">
              <button type="button" className="btn btn-primary" onClick={goToDemo}>
                {landingCopy.nav.actions.demo}
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

        <section id="what-you-get" className="landing-section" aria-labelledby="what-you-get-title">
          <div className="landing-container">
            <h2 id="what-you-get-title">{landingCopy.whatYouGet.heading}</h2>
            <ul className="landing-list-grid">
              {landingCopy.whatYouGet.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="landing-section" aria-labelledby="how-it-works-title">
          <div className="landing-container">
            <h2 id="how-it-works-title">{landingCopy.howItWorks.heading}</h2>
            <ol className="landing-steps">
              {landingCopy.howItWorks.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>

        <section id="system" className="landing-section" aria-labelledby="system-title">
          <div className="landing-container">
            <h2 id="system-title">{landingCopy.system.heading}</h2>
            <ul className="landing-list-grid">
              {landingCopy.system.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <p className="landing-system-note">{landingCopy.system.note}</p>
          </div>
        </section>

        <section id="demo" className="landing-section" aria-labelledby="demo-title">
          <div className="landing-container">
            <h2 id="demo-title">{landingCopy.demo.heading}</h2>
            <button type="button" className="landing-demo-link" onClick={goToDemo}>
              {landingCopy.demo.line}
            </button>
            <p className="landing-demo-note">{landingCopy.demo.note}</p>
          </div>
        </section>

        <section id="sign-up" className="landing-section" aria-labelledby="sign-up-title">
          <div className="landing-container landing-signup-wrap">
            <h2 id="sign-up-title">{landingCopy.signUp.heading}</h2>
            <p>{landingCopy.signUp.line}</p>

            {submitSuccess ? (
              <div className="landing-status landing-status-success" role="status" aria-live="polite">
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
                  <div className="landing-status landing-status-error" role="alert" aria-live="assertive">
                    <p>{submitError}</p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="btn btn-primary"
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
