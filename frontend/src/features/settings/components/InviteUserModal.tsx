import React, { useEffect, useRef, useState } from "react";

import type { AccessLevel } from "../types";
import SiteMultiSelect from "./SiteMultiSelect";
import styles from "./InviteUserModal.module.css";

type InviteUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: (payload: { email: string; site: string; accessLevel: AccessLevel }) => Promise<void>;
};

type InviteState = "closed" | "pristine" | "invalid" | "valid" | "submitting" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const InviteUserModal: React.FC<InviteUserModalProps> = ({ isOpen, onClose, onSubmitted }) => {
  const [email, setEmail] = useState("");
  const [sites, setSites] = useState<string[]>(["all-sites"]);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("Viewer");
  const [state, setState] = useState<InviteState>("closed");
  const [error, setError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const isValid = EMAIL_RE.test(email.trim()) && sites.length > 0 && Boolean(accessLevel);

  useEffect(() => {
    if (!isOpen) {
      setState("closed");
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => emailInputRef.current?.focus(), 0);

    if (!email) {
      setState("pristine");
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [email, isOpen]);

  useEffect(() => {
    if (!isOpen || state === "submitting" || state === "error") {
      return;
    }

    if (!email) {
      setState("pristine");
      return;
    }

    setState(isValid ? "valid" : "invalid");
  }, [email, isOpen, isValid, state]);

  const resetState = () => {
    setEmail("");
    setSites(["all-sites"]);
    setAccessLevel("Viewer");
    setState("closed");
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || state === "submitting") {
      setState("invalid");
      setError(sites.length === 0 ? "Sites required" : null);
      return;
    }

    setState("submitting");
    setError(null);

    try {
      await onSubmitted({
        email: email.trim(),
        site: sites[0],
        accessLevel,
      });
      handleClose();
    } catch (submissionError) {
      setState("error");
      setError(submissionError instanceof Error ? submissionError.message : "Unable to submit invite");
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <div className={`vrm-card ${styles.modal}`} role="dialog" aria-modal="true" aria-label="Invite user modal">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Invite user</h3>
        </div>
        <div className="vrm-card-body">
          <form onSubmit={handleSubmit} className="settings-form-grid">
            <div className="settings-form-field">
              <label className="settings-form-label" htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                ref={emailInputRef}
                className="settings-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="settings-form-field">
              <label className="settings-form-label" htmlFor="invite-site">Site</label>
              <SiteMultiSelect
                options={[{ id: "all-sites", label: "All Sites" }]}
                selectedSites={sites}
                onChange={(next) => {
                  setSites(next);
                  if (next.length > 0) {
                    setError(null);
                  }
                }}
                placeholder="Select sites"
                error={state === "invalid" && sites.length === 0 ? "Sites required" : null}
              />
            </div>
            <div className="settings-form-field">
              <label className="settings-form-label" htmlFor="invite-level">Access level</label>
              <select
                id="invite-level"
                className={`settings-select ${styles.select}`}
                value={accessLevel}
                onChange={(event) => setAccessLevel(event.target.value as AccessLevel)}
              >
                <option value="Viewer">Viewer</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            {(state === "invalid" || state === "error") && (
              <div className="settings-form-error">
                {error ?? "Email, site, and access level are required"}
              </div>
            )}
            <div className="settings-form-actions">
              <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="vrm-btn vrm-btn-primary vrm-btn-sm"
                disabled={!isValid || state === "submitting"}
              >
                {state === "submitting" ? "Sending..." : "Send invite"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InviteUserModal;
