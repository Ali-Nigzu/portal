import React, { useEffect, useMemo, useRef, useState } from "react";

import styles from "./ReenterPasswordModal.module.css";

type ReenterPasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (payload: { unlockToken: string; unlockExpiresInSeconds: number }) => void;
  onStartUnlock: (password: string) => Promise<{ ok: true; resendCooldownSeconds: number } | { ok: false; message: string }>;
  onVerifyCode: (code: string) => Promise<{ ok: true; unlockToken: string; unlockExpiresInSeconds: number } | { ok: false; message: string }>;
  onResendCode: () => Promise<{ ok: true; resendCooldownSeconds: number } | { ok: false; message: string }>;
};

type UnlockStep = "password" | "code";

const ReenterPasswordModal: React.FC<ReenterPasswordModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  onStartUnlock,
  onVerifyCode,
  onResendCode,
}) => {
  const [step, setStep] = useState<UnlockStep>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownRemaining]);

  const title = useMemo(() => (step === "password" ? "Unlock to edit" : "Enter verification code"), [step]);

  const handleClose = () => {
    setPassword("");
    setCode("");
    setError(null);
    setMessage(null);
    setCooldownRemaining(0);
    setStep("password");
    setIsSubmitting(false);
    onClose();
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || isSubmitting) {
      setError("Current password is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const result = await onStartUnlock(password);
    if (!result.ok) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    setStep("code");
    setPassword("");
    setCooldownRemaining(result.resendCooldownSeconds);
    setMessage("We sent a 6-digit code to your account email.");
    setIsSubmitting(false);
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim()) || isSubmitting) {
      setError("Enter your 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    const result = await onVerifyCode(code);
    if (!result.ok) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    setCode("");
    onVerified({ unlockToken: result.unlockToken, unlockExpiresInSeconds: result.unlockExpiresInSeconds });
  };

  const handleResend = async () => {
    if (cooldownRemaining > 0 || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onResendCode();
    if (!result.ok) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }
    setCooldownRemaining(result.resendCooldownSeconds);
    setMessage("A new verification code was sent.");
    setIsSubmitting(false);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <div className={`vrm-card ${styles.modal}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">{title}</h3>
        </div>
        <div className="vrm-card-body">
          {step === "password" ? (
            <form onSubmit={handlePasswordSubmit} className="settings-form-grid">
              <div className="settings-form-field">
                <label className="settings-form-label" htmlFor="current-password">Current password</label>
                <input
                  id="current-password"
                  ref={inputRef}
                  className="settings-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {error ? <div className="settings-form-error">{error}</div> : null}
              <div className="settings-form-actions">
                <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="vrm-btn vrm-btn-sm" disabled={isSubmitting}>
                  {isSubmitting ? "Verifying..." : "Continue"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="settings-form-grid">
              <div className="settings-form-field">
                <label className="settings-form-label" htmlFor="unlock-code">Verification code</label>
                <input
                  id="unlock-code"
                  ref={inputRef}
                  className="settings-input"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                />
              </div>
              {message ? <div className="settings-form-message">{message}</div> : null}
              {error ? <div className="settings-form-error">{error}</div> : null}
              <div className="settings-form-actions settings-form-actions--spread">
                <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={handleClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                  onClick={handleResend}
                  disabled={cooldownRemaining > 0 || isSubmitting}
                >
                  {cooldownRemaining > 0 ? `Resend in ${cooldownRemaining}s` : "Resend code"}
                </button>
                <button type="submit" className="vrm-btn vrm-btn-sm" disabled={isSubmitting}>
                  {isSubmitting ? "Unlocking..." : "Unlock"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReenterPasswordModal;
