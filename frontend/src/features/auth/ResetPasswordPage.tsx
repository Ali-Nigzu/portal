import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AuthTopBar from "../../components/auth/AuthTopBar";
import { passwordResetResend } from "./transport/passwordResetResend";
import { passwordResetStart } from "./transport/passwordResetStart";
import { passwordResetVerify } from "./transport/passwordResetVerify";
import "./VerifyEmailPage.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = (params.get("email") ?? "").trim().toLowerCase();
  const validEmail = useMemo(() => EMAIL_RE.test(email), [email]);

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validEmail) {
      setError("Please start from the login page with a valid email.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await passwordResetVerify({ email, code, password, confirm_password: confirmPassword });
      navigate("/login", { replace: true, state: { message: "Password reset successful. Please sign in." } });
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to reset password");
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async (resend = false) => {
    if (!validEmail) {
      setError("Please start from the login page with a valid email.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (resend) {
        await passwordResetResend(email);
      } else {
        await passwordResetStart(email);
      }
      setMessage("Verification code sent.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verify-email-page">
      <AuthTopBar />
      <div className="verify-email-shell">
        <section className="verify-email-left-pane" aria-label="Password reset panel">
          <div className="verify-email-content">
            <p className="verify-email-title">Reset Password</p>
            <h1 className="verify-email-hero">Enter your reset code</h1>
            <p className="verify-email-copy">{validEmail ? `Code will be sent to ${email}` : "Start from login to reset password."}</p>
            <form className="verify-email-form" onSubmit={handleVerify}>
              <div className="vrm-field verify-email-field">
                <label className="vrm-label" htmlFor="reset-code">Code</label>
                <input id="reset-code" className="vrm-input" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="vrm-field verify-email-field">
                <label className="vrm-label" htmlFor="reset-password">New password</label>
                <input id="reset-password" className="vrm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="vrm-field verify-email-field">
                <label className="vrm-label" htmlFor="reset-confirm-password">Confirm password</label>
                <input id="reset-confirm-password" className="vrm-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              {error ? <div className="verify-email-error">{error}</div> : null}
              {message ? <div className="verify-email-message">{message}</div> : null}
              <div className="verify-email-actions">
                <button type="button" className="vrm-btn vrm-btn-secondary" onClick={() => sendCode(false)} disabled={loading}>Send code</button>
                <button type="submit" className="vrm-btn vrm-btn-primary verify-email-submit" disabled={loading}>{loading ? "Submitting…" : "Reset password"}</button>
              </div>
            </form>
            <div className="verify-email-resend-row">
              <button type="button" className="verify-email-resend" onClick={() => sendCode(true)} disabled={loading}>Resend code</button>
            </div>
            <p className="verify-email-back-row"><Link to="/login" className="verify-email-link">Back to login</Link></p>
          </div>
        </section>
        <aside className="verify-email-right-pane" aria-hidden="true" />
      </div>
    </div>
  );
};

export default ResetPasswordPage;
