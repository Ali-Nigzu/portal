import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useIsPhoneLayout } from "./hooks/useIsPhoneLayout";
import { passwordResetResend } from "./transport/passwordResetResend";
import { passwordResetSetPassword } from "./transport/passwordResetSetPassword";
import { passwordResetVerifyCode } from "./transport/passwordResetVerifyCode";
import "./VerifyEmailPage.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ResetPasswordPage: React.FC = () => {
  const isPhoneLayout = useIsPhoneLayout();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const email = (params.get("email") ?? "").trim().toLowerCase();
  const resetToken = (params.get("resetToken") ?? "").trim();
  const validEmail = useMemo(() => EMAIL_RE.test(email), [email]);
  const isCodeStep = location.pathname === "/reset-password" || location.pathname === "/reset-password/code";

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(30);

  useEffect(() => {
    if (!isCodeStep || cooldownRemaining <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setCooldownRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownRemaining, isCodeStep]);

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validEmail) {
      setError("Please start from the login page with a valid email.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await passwordResetVerifyCode({ email, code });
      navigate(`/reset-password/new?email=${encodeURIComponent(email)}&resetToken=${encodeURIComponent(result.resetToken)}`);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify reset code");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validEmail || !resetToken) {
      setError("Invalid or expired reset session. Please restart from login.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await passwordResetSetPassword({
        email,
        reset_token: resetToken,
        password,
        confirm_password: confirmPassword,
      });
      navigate("/login", { replace: true, state: { message: "Password reset successful. Please sign in." } });
    } catch (setPasswordError) {
      setError(setPasswordError instanceof Error ? setPasswordError.message : "Unable to reset password");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!validEmail) {
      setError("Please start from the login page with a valid email.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await passwordResetResend(email);
      setMessage("A new verification code was sent.");
      setCooldownRemaining(30);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to resend code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verify-email-page">
      {isPhoneLayout ? <AuthLogoHeader /> : <AuthTopBar />}
      <div className="verify-email-shell">
        <section className="verify-email-left-pane" aria-label="Password reset panel">
          <div className="verify-email-content">
            <p className="verify-email-title">Reset Password</p>
            <h1 className="verify-email-hero">{isCodeStep ? "Enter verification code" : "Set new password"}</h1>
            <p className="verify-email-copy">
              {isCodeStep
                ? validEmail
                  ? <>We sent a reset code to <strong>{email}</strong>.</>
                  : "Start from login to reset password."
                : "Choose your new password."}
            </p>

            <form className="verify-email-form" onSubmit={isCodeStep ? handleVerifyCode : handleSetPassword}>
              {isCodeStep ? (
                <div className="vrm-field verify-email-field">
                  <label className="vrm-label" htmlFor="reset-code">Verification code</label>
                  <input id="reset-code" className="vrm-input" value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
              ) : (
                <>
                  <div className="vrm-field verify-email-field">
                    <label className="vrm-label" htmlFor="reset-password">New password</label>
                    <input id="reset-password" className="vrm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="vrm-field verify-email-field">
                    <label className="vrm-label" htmlFor="reset-confirm-password">Confirm password</label>
                    <input id="reset-confirm-password" className="vrm-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  </div>
                </>
              )}

              {error ? <div className="verify-email-error">{error}</div> : null}
              {message ? <div className="verify-email-message">{message}</div> : null}

              <div className="verify-email-actions">
                <button type="submit" className="vrm-btn vrm-btn-primary verify-email-submit" disabled={loading}>
                  {loading ? "Submitting…" : isCodeStep ? "Verify code" : "Set new password"}
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
                  {cooldownRemaining > 0 ? `Resend in ${cooldownRemaining}s` : "Resend code"}
                </button>
              </div>
            ) : null}

            <p className="verify-email-back-row"><Link to="/login" className="verify-email-link">Back to login</Link></p>
          </div>
        </section>
        <aside className="verify-email-right-pane" aria-hidden="true" />
      </div>

      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default ResetPasswordPage;
