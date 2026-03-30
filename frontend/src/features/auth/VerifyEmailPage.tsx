import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useIsPhoneLayout } from "./hooks/useIsPhoneLayout";
import { signupResend } from "./transport/signupResend";
import { signupVerify } from "./transport/signupVerify";
import "./VerifyEmailPage.css";

const VerifyEmailPage: React.FC = () => {
  const isPhoneLayout = useIsPhoneLayout();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = useMemo(() => searchParams.get("email")?.trim().toLowerCase() ?? "", [searchParams]);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownRemaining]);

  const mapVerifyError = (status: number, detail?: string) => {
    if (status === 400) return "The verification code is incorrect.";
    if (status === 404) return "No pending signup found. Please create your account again.";
    if (status === 410) return "Your verification code has expired. Please resend a new code.";
    if (status === 422) return detail || "Please enter the 6-digit code.";
    if (status === 429) return detail || "Too many attempts. Please restart signup.";
    if (status === 503) return detail || "Email service is not configured.";
    if (status === 502) return detail || "Email delivery failed. Please try again.";
    return detail || "Unable to verify code. Please try again.";
  };

  const mapResendError = (status: number, detail?: string) => {
    if (status === 404) return "No pending signup found. Please create your account again.";
    if (status === 410) return "Your code expired. Please restart signup.";
    if (status === 429) return detail || "Please wait before requesting another code.";
    if (status === 503) return detail || "Email service is not configured.";
    if (status === 502) return detail || "Failed to send verification email.";
    return detail || "Unable to resend code.";
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!email) {
      setError("Missing email. Return to create account and try again.");
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter your 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const result = await signupVerify(email, code);
      if (result.ok) {
        navigate("/login");
        return;
      }
      setError(mapVerifyError(result.status, result.message));
    } catch {
      setError("Unable to verify code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldownRemaining > 0 || resending) {
      return;
    }

    setResending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await signupResend(email);
      if (result.ok) {
        setCooldownRemaining(result.data.resendCooldownSeconds);
        setMessage("A new verification code was sent.");
      } else {
        setError(mapResendError(result.status, result.message));
      }
    } catch {
      setError("Unable to resend verification code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="verify-email-page">
      {isPhoneLayout ? <AuthLogoHeader /> : <AuthTopBar />}

      <div className="verify-email-shell">
        <section className="verify-email-left-pane" aria-label="Email verification panel">
          <div className="verify-email-content">
            <p className="verify-email-title">Verify Email</p>
            <h1 className="verify-email-hero">Enter the 6-digit code</h1>
            <p className="verify-email-copy">
              We sent a verification code to <strong>{email || "your email"}</strong>.
            </p>

            <form className="verify-email-form" onSubmit={handleVerify}>
              <div className="vrm-field verify-email-field">
                <label className="vrm-label" htmlFor="verify-code">Verification code</label>
                <input
                  id="verify-code"
                  className="vrm-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    if (error) {
                      setError(null);
                    }
                  }}
                  placeholder="123456"
                  aria-invalid={Boolean(error)}
                />
              </div>

              {error && (
                <div className="verify-email-error" role="alert" aria-live="assertive">
                  {error}
                </div>
              )}

              {message && (
                <div className="verify-email-message" role="status" aria-live="polite">
                  {message}
                </div>
              )}

              <div className="verify-email-actions">
                <button type="submit" className="vrm-btn vrm-btn-primary verify-email-submit" disabled={loading}>
                  {loading ? "Verifying…" : "Verify email"}
                </button>
              </div>
            </form>

            <div className="verify-email-resend-row">
              <button
                type="button"
                className="verify-email-resend"
                onClick={handleResend}
                disabled={resending || cooldownRemaining > 0 || !email}
              >
                {cooldownRemaining > 0
                  ? `Resend code in ${cooldownRemaining}s`
                  : resending
                    ? "Sending…"
                    : "Resend code"}
              </button>
            </div>

            <p className="verify-email-back-row">
              Wrong email? <Link to="/create-account" className="verify-email-link">Create account again</Link>
            </p>
          </div>
        </section>

        <aside className="verify-email-right-pane" aria-hidden="true" />
      </div>

      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default VerifyEmailPage;
