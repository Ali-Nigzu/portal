import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import AuthBottomNav from "../../components/auth/AuthBottomNav";
import {
  AuthDesktopArtwork,
  AuthLogoHeader,
} from "../../components/auth/AuthLogoHeader";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useIsPhoneLayout } from "../../common/hooks/useIsPhoneLayout";
import {
  passwordResetStart,
  passwordResetResend,
  passwordResetSetPassword,
  passwordResetVerifyCode,
} from "./transport/passwordReset";
import "./VerifyEmailPage.css";

const ResetPasswordPage: React.FC = () => {
  const isPhoneLayout = useIsPhoneLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const isIdentifyStep = location.pathname === "/reset-password";
  const isCodeStep = location.pathname === "/reset-password/code";
  const [identifier, setIdentifier] = useState(() => {
    const prefill = (location.state as { identifier?: unknown } | null)
      ?.identifier;
    return typeof prefill === "string" ? prefill : "";
  });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const inFlight = useRef(false);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError(null);
    setMessage(null);
    setCode("");
    setPassword("");
    setConfirmPassword("");
    if (!isIdentifyStep) setIdentifier("");
    firstInput.current?.focus();
  }, [location.pathname, isIdentifyStep]);

  const coolingDown = isCodeStep && cooldownRemaining > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const timer = window.setInterval(
      () => setCooldownRemaining((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [coolingDown]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (isIdentifyStep && !identifier.trim()) {
      setError("Enter your email or username.");
      firstInput.current?.focus();
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (isIdentifyStep) {
        const result = await passwordResetStart(identifier);
        setCooldownRemaining(result.resendCooldownSeconds);
        navigate("/reset-password/code", { replace: true });
      } else if (isCodeStep) {
        await passwordResetVerifyCode({ code });
        navigate("/reset-password/new", { replace: true });
      } else {
        await passwordResetSetPassword({
          password,
          confirm_password: confirmPassword,
        });
        navigate("/login", {
          replace: true,
          state: { message: "Password reset successful. Please sign in." },
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete password reset.",
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (inFlight.current || cooldownRemaining > 0) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await passwordResetResend();
      setMessage(
        "If your recovery request is still valid, we'll send another code.",
      );
      setCooldownRemaining(result.resendCooldownSeconds);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to resend code.",
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="verify-email-page">
      {isPhoneLayout ? <AuthLogoHeader /> : <AuthTopBar />}
      <div className="verify-email-shell">
        <section
          className="verify-email-left-pane"
          aria-label="Password reset panel"
        >
          <div className="verify-email-content">
            <p className="verify-email-title">Reset Password</p>
            <h1 className="verify-email-hero">
              {isIdentifyStep
                ? "Find your account"
                : isCodeStep
                  ? "Enter verification code"
                  : "Set new password"}
            </h1>
            <p className="verify-email-copy">
              {isIdentifyStep
                ? "Enter the email address or username you use to sign in."
                : isCodeStep
                  ? "If an account is associated with those details, we'll send a password reset code to the email address registered to the account."
                  : "Choose your new password."}
            </p>
            <form
              className="verify-email-form"
              onSubmit={submit}
              aria-busy={loading}
            >
              {isIdentifyStep ? (
                <div className="vrm-field verify-email-field">
                  <label className="vrm-label" htmlFor="reset-identifier">
                    Email or username
                  </label>
                  <input
                    ref={firstInput}
                    id="reset-identifier"
                    className="vrm-input"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={320}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "reset-error" : undefined}
                  />
                </div>
              ) : isCodeStep ? (
                <div className="vrm-field verify-email-field">
                  <label className="vrm-label" htmlFor="reset-code">
                    Verification code
                  </label>
                  <input
                    ref={firstInput}
                    id="reset-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "reset-error" : undefined}
                    className="vrm-input"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="vrm-field verify-email-field">
                    <label className="vrm-label" htmlFor="reset-password">
                      New password
                    </label>
                    <input
                      ref={firstInput}
                      id="reset-password"
                      className="vrm-input"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "reset-error" : undefined}
                    />
                  </div>
                  <div className="vrm-field verify-email-field">
                    <label
                      className="vrm-label"
                      htmlFor="reset-confirm-password"
                    >
                      Confirm password
                    </label>
                    <input
                      id="reset-confirm-password"
                      className="vrm-input"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "reset-error" : undefined}
                    />
                  </div>
                </>
              )}
              {error ? (
                <div
                  id="reset-error"
                  className="verify-email-error"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}
              {message ? (
                <div
                  className="verify-email-message"
                  role="status"
                  aria-live="polite"
                >
                  {message}
                </div>
              ) : null}
              <div className="verify-email-actions">
                <button
                  type="submit"
                  className="vrm-btn vrm-btn-primary verify-email-submit"
                  disabled={loading}
                >
                  {loading
                    ? "Submitting…"
                    : isIdentifyStep
                      ? "Continue"
                      : isCodeStep
                        ? "Verify code"
                        : "Set new password"}
                </button>
              </div>
            </form>
            {isCodeStep ? (
              <div className="verify-email-resend-row">
                <button
                  type="button"
                  className="verify-email-resend"
                  onClick={resendCode}
                  disabled={loading || cooldownRemaining > 0}
                >
                  {cooldownRemaining > 0
                    ? `Resend in ${cooldownRemaining}s`
                    : "Resend code"}
                </button>
              </div>
            ) : null}
            {!isIdentifyStep ? (
              <p className="verify-email-back-row">
                <Link to="/reset-password" className="verify-email-link">
                  Restart password reset
                </Link>
              </p>
            ) : null}
            <p className="verify-email-back-row">
              <Link to="/login" className="verify-email-link">
                Back to login
              </Link>
            </p>
          </div>
        </section>
        <aside className="verify-email-right-pane" aria-hidden="true">
          <AuthDesktopArtwork />
        </aside>
      </div>
      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default ResetPasswordPage;
