import React, { useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthDesktopArtwork from "../../components/auth/AuthDesktopArtwork";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useIsPhoneLayout } from "./hooks/useIsPhoneLayout";
import { useLoginForm } from "./hooks/useLoginForm";
import { passwordResetStart } from "./transport/passwordResetStart";
import "./LoginPage.css";

interface LoginPageProps {
  onLogin: () => void | Promise<void>;
}

type LoginStep = "email" | "password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const isPhoneLayout = useIsPhoneLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as { message?: string } | null)?.message;
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
  const [staySignedIn, setStaySignedIn] = useState(true);

  const emailValid = useMemo(() => EMAIL_RE.test(email.trim().toLowerCase()), [email]);

  const onPrimaryAction = async (event: React.FormEvent) => {
    event.preventDefault();

    if (step === "email") {
      if (!email.trim()) {
        setEmailStepError("This field is required");
        return;
      }
      setEmailStepError(null);
      setStep("password");
      return;
    }

    await handleSubmit(event);
  };

  const handleResetPasswordClick: React.MouseEventHandler<HTMLAnchorElement> = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      setEmailStepError("Enter your email before resetting your password");
      if (step !== "email") {
        setStep("email");
      }
      return;
    }
    if (!emailValid) {
      setEmailStepError("Not a valid email address");
      if (step !== "email") {
        setStep("email");
      }
      return;
    }
    try {
      await passwordResetStart(email.trim().toLowerCase());
      navigate(`/reset-password/code?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (resetError) {
      setEmailStepError(resetError instanceof Error ? resetError.message : "Unable to start password reset.");
    }
  };

  return (
    <div className="login-page">
      {isPhoneLayout ? <AuthLogoHeader /> : <AuthTopBar />}

      <div className="login-shell">
        <section className="login-left-pane" aria-label="Login form panel">
          <div className="login-content">
            <h1 className="login-hero">Welcome Back</h1>
            {successMessage && <p role="status" className="verify-email-message">{successMessage}</p>}

            <form className="login-form" onSubmit={onPrimaryAction}>
              <div className="vrm-field login-field">
                <label className="vrm-label" htmlFor="login-email">Email or username</label>
                <input
                  id="login-email"
                  className="vrm-input"
                  type="text"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailStepError) {
                      setEmailStepError(null);
                    }
                  }}
                  placeholder="Enter email or username"
                  autoComplete="username"
                  aria-invalid={Boolean(emailStepError)}
                  aria-describedby={emailStepError ? "login-email-error" : undefined}
                />
                <div className="login-error-slot" aria-live="polite">
                  {emailStepError && <div id="login-email-error" className="login-error">{emailStepError}</div>}
                </div>
              </div>

              {step === "password" && (
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

              {error && step === "password" && (
                <div className="vrm-status vrm-status-warning login-request-error" role="alert" aria-live="assertive">
                  {error}
                </div>
              )}

              <div className="login-actions">
                <button type="submit" className="vrm-btn vrm-btn-primary login-submit" disabled={loading}>
                  {step === "email" ? "Continue" : loading ? "Signing in…" : "Login"}
                </button>
              </div>

              <div className="login-under-cta">
                <label className="login-utility-row login-checkbox-row" htmlFor="login-stay-signed-in">
                  <input
                    id="login-stay-signed-in"
                    type="checkbox"
                    checked={staySignedIn}
                    onChange={(event) => setStaySignedIn(event.target.checked)}
                  />
                  <span>Stay signed-in</span>
                </label>

                <p className="login-utility-row login-muted-row">
                  Don’t have an account yet? <Link to="/create-account" className="login-inline-link">Sign up</Link>
                </p>

                {step === "password" && (
                  <p className="login-utility-row login-muted-row">
                    Forgot your password? <a href="#" onClick={handleResetPasswordClick} className="login-inline-link">Reset password</a>
                  </p>
                )}
              </div>
            </form>
          </div>
        </section>

        <aside className="login-right-pane" aria-hidden="true">
          <AuthDesktopArtwork />
        </aside>
      </div>

      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default LoginPage;
