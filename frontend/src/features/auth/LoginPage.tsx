import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useLoginForm } from "./hooks/useLoginForm";
import "./LoginPage.css";

interface LoginPageProps {
  onLogin: () => void;
}

type LoginStep = "email" | "password" | "submitting" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stopNavigation: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
  event.preventDefault();
};

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const {
    email,
    password,
    error,
    loading,
    setEmail,
    setPassword,
    handleSubmit,
  } = useLoginForm(onLogin);

  const [step, setStep] = useState<LoginStep>("email");
  const [emailStepError, setEmailStepError] = useState<string | null>(null);

  const emailValid = useMemo(() => EMAIL_RE.test(email.trim().toLowerCase()), [email]);
  const isPasswordStep = step === "password" || step === "submitting" || step === "error";

  useEffect(() => {
    if (loading) {
      setStep("submitting");
      return;
    }
    if (step === "submitting") {
      setStep(error ? "error" : "password");
    }
  }, [error, loading, step]);

  const onPrimaryAction = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isPasswordStep) {
      if (!email.trim()) {
        setEmailStepError("This field is required");
        return;
      }
      if (!emailValid) {
        setEmailStepError("Not a valid email address");
        return;
      }
      setEmailStepError(null);
      setStep("password");
      return;
    }

    await handleSubmit(event);
  };

  return (
    <div className="login-page">
      <AuthTopBar />

      <div className="login-shell">
        <section className="login-left-pane" aria-label="Login form panel">
          <div className="login-content">
            <p className="login-title">Login</p>
            <h1 className="login-hero">Welcome Back</h1>

            <form className="login-form" onSubmit={onPrimaryAction}>
              <div className="vrm-field login-field">
                <label className="vrm-label" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="vrm-input"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailStepError) {
                      setEmailStepError(null);
                    }
                  }}
                  placeholder="Enter email"
                  autoComplete="email"
                  aria-invalid={Boolean(emailStepError)}
                  aria-describedby={emailStepError ? "login-email-error" : undefined}
                />
                <div className="login-error-slot" aria-live="polite">
                  {emailStepError && <div id="login-email-error" className="login-error">{emailStepError}</div>}
                </div>
              </div>

              {isPasswordStep && (
                <div className="vrm-field login-field">
                  <label className="vrm-label" htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    className="vrm-input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </div>
              )}

              {error && isPasswordStep && (
                <div className="vrm-status vrm-status-warning login-request-error" role="alert" aria-live="assertive">
                  {error}
                </div>
              )}

              <div className="login-actions">
                <button type="submit" className="vrm-btn vrm-btn-primary login-submit" disabled={loading}>
                  {!isPasswordStep ? "Continue" : loading ? "Signing in…" : "Login"}
                </button>
              </div>

              <div className="login-links">
                <Link to="/create-account" className="login-link">Sign up</Link>
                <a href="#" onClick={stopNavigation} className="login-link">Reset password</a>
              </div>
            </form>
          </div>
        </section>

        <aside className="login-right-pane" aria-label="System visual placeholder" />
      </div>
    </div>
  );
};

export default LoginPage;
