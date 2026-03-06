import React, { useEffect, useMemo, useState } from "react";

import {
  getMe,
  resendSettingsUnlockCode,
  startSettingsUnlock,
  updateMe,
  verifySettingsUnlockCode,
} from "../api/settingsApi";
import ReenterPasswordModal from "../components/ReenterPasswordModal";
import SettingsFrame from "../components/SettingsFrame";
import SettingsPageHeader from "../components/SettingsPageHeader";
import type { SettingsUser } from "../types";
import "../SettingsPages.css";

type DraftState = {
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

type FormErrorState = {
  name?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
};

const PHONE_RE = /^\+[1-9]\d{6,14}$/;

const maskEmail = (email: string) => {
  const [localPart, domain] = email.split("@");
  if (!domain) {
    return "••••";
  }
  const visible = Math.min(2, localPart.length);
  return `${localPart.slice(0, visible)}${"•".repeat(Math.max(localPart.length - visible, 4))}@${domain}`;
};

const maskPhone = (phone: string | null | undefined) => {
  if (!phone) {
    return "—";
  }
  const visible = phone.slice(-2);
  return `${"•".repeat(Math.max(phone.length - 2, 4))}${visible}`;
};

const MyAccountPage: React.FC = () => {
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [unlockExpiresAt, setUnlockExpiresAt] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrorState>({});
  const [drafts, setDrafts] = useState<DraftState>({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await getMe();
        setUser(me);
        setDrafts({
          name: me.name,
          phone: me.phone ?? "",
          password: "",
          confirmPassword: "",
        });
      } catch (error) {
        setLoadingError(error instanceof Error ? error.message : "Unable to load account");
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!isUnlocked || !unlockExpiresAt) {
      return;
    }
    const timer = window.setInterval(() => {
      if (Date.now() >= unlockExpiresAt) {
        setIsUnlocked(false);
        setUnlockToken(null);
        setUnlockExpiresAt(null);
        setErrors((prev) => ({ ...prev, form: "Editing lock expired. Unlock again to continue." }));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isUnlocked, unlockExpiresAt]);

  useEffect(() => {
    return () => {
      setIsUnlocked(false);
      setUnlockToken(null);
      setUnlockExpiresAt(null);
    };
  }, []);

  const unlockTimeLeftLabel = useMemo(() => {
    if (!isUnlocked || !unlockExpiresAt) {
      return null;
    }
    const seconds = Math.max(0, Math.floor((unlockExpiresAt - Date.now()) / 1000));
    return `${seconds}s`;
  }, [isUnlocked, unlockExpiresAt]);

  const resetDrafts = (nextUser: SettingsUser) => {
    setDrafts({
      name: nextUser.name,
      phone: nextUser.phone ?? "",
      password: "",
      confirmPassword: "",
    });
  };

  const relock = (nextUser?: SettingsUser) => {
    setIsUnlocked(false);
    setUnlockToken(null);
    setUnlockExpiresAt(null);
    setErrors({});
    if (nextUser) {
      resetDrafts(nextUser);
    } else if (user) {
      resetDrafts(user);
    }
  };

  const handleSave = async () => {
    if (!user) {
      return;
    }

    const nextErrors: FormErrorState = {};
    const trimmedName = drafts.name.trim();
    const trimmedPhone = drafts.phone.trim();

    if (!trimmedName) {
      nextErrors.name = "This field is required";
    }

    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      nextErrors.phone = "Phone must be in international format (e.g. +447700900123)";
    }

    const isPasswordProvided = drafts.password.length > 0 || drafts.confirmPassword.length > 0;
    if (isPasswordProvided) {
      if (!drafts.password || !drafts.confirmPassword) {
        nextErrors.password = "Password and confirm password are required";
      } else {
        if (drafts.password.length < 8) {
          nextErrors.password = "Password must be at least 8 characters";
        }
        if (drafts.password !== drafts.confirmPassword) {
          nextErrors.confirmPassword = "Passwords do not match";
        }
      }
    }

    if (!unlockToken) {
      nextErrors.form = "Unlock required before saving";
    }

    setErrors(nextErrors);
    setSaveMessage(null);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const updatedUser = await updateMe({
        name: trimmedName,
        phone: trimmedPhone,
        password: drafts.password || undefined,
        confirm_password: drafts.confirmPassword || undefined,
        unlock_token: unlockToken,
      });
      setUser(updatedUser);
      setSaveMessage("Account updated successfully.");
      relock(updatedUser);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save";
      if (message.toLowerCase().includes("unlock")) {
        relock();
      }
      setErrors((prev) => ({ ...prev, form: message }));
    } finally {
      setSaving(false);
    }
  };

  if (loadingError) {
    return (
      <SettingsFrame>
        <SettingsPageHeader title="My Account" />
        <div className="vrm-card">
          <div className="vrm-card-body">{loadingError}</div>
        </div>
      </SettingsFrame>
    );
  }

  if (!user) {
    return (
      <SettingsFrame>
        <SettingsPageHeader title="My Account" />
        <div className="vrm-card">
          <div className="vrm-card-body">Loading account…</div>
        </div>
      </SettingsFrame>
    );
  }

  return (
    <SettingsFrame>
      <SettingsPageHeader
        title="My Account"
        action={(
          <div className="settings-account-header-actions">
            {!isUnlocked ? (
              <button className="vrm-btn vrm-btn-sm" onClick={() => setIsUnlockOpen(true)}>
                Unlock to edit
              </button>
            ) : (
              <>
                <span className="settings-unlock-chip" aria-live="polite">Unlocked {unlockTimeLeftLabel ? `(${unlockTimeLeftLabel})` : ""}</span>
                <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={() => relock()}>
                  Cancel / Lock
                </button>
                <button className="vrm-btn vrm-btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            )}
          </div>
        )}
      />
      <div className="vrm-card">
        <div className="vrm-card-body settings-account-card-body settings-account-locked-layout">
          <div className="settings-field-row">
            <div className="settings-field-label">Username</div>
            <div className="settings-field-main">
              {!isUnlocked ? (
                <div className="settings-field-value">{user.name}</div>
              ) : (
                <>
                  <input
                    className="settings-input"
                    value={drafts.name}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  {errors.name ? <div className="settings-inline-error">{errors.name}</div> : null}
                </>
              )}
            </div>
          </div>

          <div className="settings-field-row">
            <div className="settings-field-label">Email</div>
            <div className="settings-field-main">
              <div className="settings-field-value">{maskEmail(user.email)}</div>
              <div className="settings-field-help">Email cannot be changed from My Account.</div>
            </div>
          </div>

          <div className="settings-field-row">
            <div className="settings-field-label">Phone</div>
            <div className="settings-field-main">
              {!isUnlocked ? (
                <div className="settings-field-value">{maskPhone(user.phone)}</div>
              ) : (
                <>
                  <input
                    className="settings-input"
                    value={drafts.phone}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="+447700900123"
                  />
                  {errors.phone ? <div className="settings-inline-error">{errors.phone}</div> : null}
                </>
              )}
            </div>
          </div>

          <div className="settings-field-row">
            <div className="settings-field-label">Password</div>
            <div className="settings-field-main">
              {!isUnlocked ? (
                <div className="settings-field-value">••••••••</div>
              ) : (
                <div className="settings-password-group">
                  <input
                    className="settings-input"
                    type="password"
                    value={drafts.password}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="New password"
                  />
                  <input
                    className="settings-input"
                    type="password"
                    value={drafts.confirmPassword}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    placeholder="Confirm new password"
                  />
                  {errors.password ? <div className="settings-inline-error">{errors.password}</div> : null}
                  {errors.confirmPassword ? <div className="settings-inline-error">{errors.confirmPassword}</div> : null}
                </div>
              )}
            </div>
          </div>

          {errors.form ? <div className="settings-form-error settings-account-global-error">{errors.form}</div> : null}
          {saveMessage ? <div className="settings-form-message settings-account-global-message">{saveMessage}</div> : null}
        </div>
      </div>

      <ReenterPasswordModal
        isOpen={isUnlockOpen}
        onClose={() => setIsUnlockOpen(false)}
        onVerified={({ unlockToken: verifiedUnlockToken, unlockExpiresInSeconds }) => {
          setUnlockToken(verifiedUnlockToken);
          setUnlockExpiresAt(Date.now() + (unlockExpiresInSeconds * 1000));
          setIsUnlocked(true);
          setIsUnlockOpen(false);
          setErrors({});
          setSaveMessage(null);
        }}
        onStartUnlock={async (password) => {
          const result = await startSettingsUnlock(password);
          if (!result.ok) {
            return { ok: false as const, message: result.message ?? "Unable to verify password" };
          }
          return { ok: true as const, resendCooldownSeconds: result.data.resendCooldownSeconds };
        }}
        onVerifyCode={async (code) => {
          const result = await verifySettingsUnlockCode(code);
          if (!result.ok) {
            return { ok: false as const, message: result.message ?? "Unable to verify code" };
          }
          return {
            ok: true as const,
            unlockToken: result.data.unlockToken,
            unlockExpiresInSeconds: result.data.unlockExpiresInSeconds,
          };
        }}
        onResendCode={async () => {
          const result = await resendSettingsUnlockCode();
          if (!result.ok) {
            return { ok: false as const, message: result.message ?? "Unable to resend code" };
          }
          return { ok: true as const, resendCooldownSeconds: result.data.resendCooldownSeconds };
        }}
      />
    </SettingsFrame>
  );
};

export default MyAccountPage;
