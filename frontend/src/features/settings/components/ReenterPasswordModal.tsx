import React, { useEffect, useRef, useState } from "react";

import styles from "./ReenterPasswordModal.module.css";

type ReenterPasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  onVerifyPassword: (password: string) => Promise<void>;
};

const ReenterPasswordModal: React.FC<ReenterPasswordModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  onVerifyPassword,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  }, [isOpen]);

  const handleClose = () => {
    setPassword("");
    setError(null);
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || isSubmitting) {
      setError("Current password is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onVerifyPassword(password);
      setPassword("");
      onVerified();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify password");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <div className={`vrm-card ${styles.modal}`} role="dialog" aria-modal="true" aria-label="Re-enter password">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Re-enter password</h3>
        </div>
        <div className="vrm-card-body">
          <form onSubmit={handleSubmit} className="settings-form-grid">
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
        </div>
      </div>
    </div>
  );
};

export default ReenterPasswordModal;
