import React, { useEffect, useMemo, useState } from "react";
import { PenLine } from "lucide-react";

import {
  getMe,
  resendSettingsUnlockCode,
  startSettingsUnlock,
  updateMe,
  verifySettingsUnlockCode,
} from "../api/settingsApi";
import EditableFieldRow from "../components/EditableFieldRow";
import ReenterPasswordModal from "../components/ReenterPasswordModal";
import SettingsFrame from "../components/SettingsFrame";
import SettingsPageHeader from "../components/SettingsPageHeader";
import type { SettingsUser } from "../types";
import AuthPhoneField from "../../auth/components/AuthPhoneField";
import { COUNTRY_PHONE_OPTIONS } from "../../auth/countryPhoneData";
import "../../auth/components/AuthPhoneField.css";
import "../SettingsPages.css";

type RowId = "name" | "phone" | "password" | null;

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

type UnlockSession = {
  token: string;
  expiresAt: number;
} | null;

const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const INTERNAL_UNLOCK_SESSION_SECONDS = 300;
const FALLBACK_COUNTRY_CODE = "+44";
const SORTED_DIAL_CODES = Array.from(new Set(COUNTRY_PHONE_OPTIONS.map((option) => option.dialCode))).sort(
  (left, right) => right.length - left.length,
);

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

const composePhoneValue = (countryCode: string, localNumber: string) => {
  const normalizedLocal = localNumber.trim().replace(/^0+/, "");
  return normalizedLocal ? `${countryCode}${normalizedLocal}` : "";
};

const splitPhoneValue = (phone: string | null | undefined) => {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) {
    return { countryCode: FALLBACK_COUNTRY_CODE, localNumber: "" };
  }

  const normalized = trimmed.startsWith("+")
    ? `+${trimmed.slice(1).replace(/\D/g, "")}`
    : `+${trimmed.replace(/\D/g, "")}`;

  const matchedDialCode = SORTED_DIAL_CODES.find((dialCode) => normalized.startsWith(dialCode));
  if (matchedDialCode) {
    return {
      countryCode: matchedDialCode,
      localNumber: normalized.slice(matchedDialCode.length),
    };
  }

  return {
    countryCode: FALLBACK_COUNTRY_CODE,
    localNumber: normalized.replace(/^\+/, ""),
  };
};

const MyAccountPage: React.FC = () => {
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [unlockSession, setUnlockSession] = useState<UnlockSession>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeEditingRowId, setActiveEditingRowId] = useState<RowId>(null);
  const [errors, setErrors] = useState<FormErrorState>({});
  const [phoneCountryCode, setPhoneCountryCode] = useState(FALLBACK_COUNTRY_CODE);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("");
  const [drafts, setDrafts] = useState<DraftState>({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const isUnlocked = useMemo(() => Boolean(unlockSession && Date.now() < unlockSession.expiresAt), [unlockSession]);

  const syncPhoneDrafts = (phone: string | null | undefined) => {
    const split = splitPhoneValue(phone);
    setPhoneCountryCode(split.countryCode);
    setPhoneLocalNumber(split.localNumber);
    setDrafts((prev) => ({ ...prev, phone: composePhoneValue(split.countryCode, split.localNumber) }));
  };

  useEffect(() => {
    const load = async () => {
      try {
        const me = await getMe();
        setUser(me);
        const split = splitPhoneValue(me.phone);
        setPhoneCountryCode(split.countryCode);
        setPhoneLocalNumber(split.localNumber);
        setDrafts({
          name: me.name,
          phone: composePhoneValue(split.countryCode, split.localNumber),
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
    if (!unlockSession) {
      return;
    }
    const timer = window.setInterval(() => {
      if (Date.now() >= unlockSession.expiresAt) {
        setUnlockSession(null);
        setActiveEditingRowId(null);
        setErrors((prev) => ({ ...prev, form: "Editing lock expired. Unlock again to continue." }));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [unlockSession]);

  const resetDrafts = (nextUser: SettingsUser) => {
    const split = splitPhoneValue(nextUser.phone);
    setPhoneCountryCode(split.countryCode);
    setPhoneLocalNumber(split.localNumber);
    setDrafts({
      name: nextUser.name,
      phone: composePhoneValue(split.countryCode, split.localNumber),
      password: "",
      confirmPassword: "",
    });
  };

  const relock = (nextUser?: SettingsUser) => {
    setUnlockSession(null);
    setActiveEditingRowId(null);
    setErrors({});
    if (nextUser) {
      resetDrafts(nextUser);
    } else if (user) {
      resetDrafts(user);
    }
  };

  const requestEdit = (rowId: Exclude<RowId, null>) => {
    if (!isUnlocked || !unlockSession) {
      relock();
      setIsUnlockOpen(true);
      return;
    }
    setSaveMessage(null);
    setErrors({});
    setActiveEditingRowId(rowId);
    if (rowId === "password") {
      setDrafts((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    }
    if (rowId === "phone") {
      syncPhoneDrafts(user?.phone);
    }
  };

  const handleSave = async (rowId: Exclude<RowId, null>) => {
    if (!user || !unlockSession || !isUnlocked) {
      relock();
      setErrors({ form: "Unlock required before saving" });
      return;
    }

    const nextErrors: FormErrorState = {};
    const payload: Record<string, string> = { unlock_token: unlockSession.token };

    if (rowId === "name") {
      const trimmedName = drafts.name.trim();
      if (!trimmedName) {
        nextErrors.name = "This field is required";
      } else {
        payload.name = trimmedName;
      }
    }

    if (rowId === "phone") {
      const composedPhone = composePhoneValue(phoneCountryCode, phoneLocalNumber);
      if (composedPhone && !PHONE_RE.test(composedPhone)) {
        nextErrors.phone = "Phone must be in international format (e.g. +447700900123)";
      } else {
        payload.phone = composedPhone;
      }
    }

    if (rowId === "password") {
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
      payload.password = drafts.password;
      payload.confirm_password = drafts.confirmPassword;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const updatedUser = await updateMe(payload);
      setUser(updatedUser);
      setSaveMessage("Account updated successfully.");
      setActiveEditingRowId(null);
      setErrors({});
      resetDrafts(updatedUser);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save";
      if (message.toLowerCase().includes("unlock")) {
        relock();
        setErrors({ form: "Unlock session expired. Please unlock again." });
      } else {
        setErrors({ form: message });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loadingError) {
    return (
      <SettingsFrame>
        <div className="settings-form-error">{loadingError}</div>
      </SettingsFrame>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SettingsFrame>
      <SettingsPageHeader
        title="My Account"
        action={
          <div className="settings-account-header-actions">
            {isUnlocked ? <span className="settings-unlock-chip">Unlocked</span> : null}
            {!isUnlocked ? (
              <button className="vrm-btn vrm-btn-sm" onClick={() => setIsUnlockOpen(true)}>Unlock to edit</button>
            ) : (
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={() => relock()}>Cancel / Lock</button>
            )}
          </div>
        }
      />
      <div className="vrm-card">
        <div className="vrm-card-body settings-account-card-body">
          <EditableFieldRow
            label="Username"
            displayValue={user.name}
            value={drafts.name}
            isEditing={activeEditingRowId === "name"}
            isSaving={saving}
            error={errors.name}
            onEdit={() => requestEdit("name")}
            onCancel={() => {
              setDrafts((prev) => ({ ...prev, name: user.name }));
              setActiveEditingRowId(null);
              setErrors({});
            }}
            onSave={() => handleSave("name")}
            onChange={(value) => setDrafts((prev) => ({ ...prev, name: value }))}
          />

          <div className="settings-field-row settings-field-row--readonly">
            <div className="settings-field-label">Email</div>
            <div className="settings-field-main">
              <div className="settings-field-value">{maskEmail(user.email)}</div>
              <div className="settings-field-help">Email cannot be changed from My Account.</div>
            </div>
            <div className="settings-field-actions" aria-hidden="true" />
          </div>

          <div className={`settings-field-row ${activeEditingRowId !== "phone" ? "settings-field-row--readonly" : ""}`}>
            <div className="settings-field-label">Phone</div>
            <div className="settings-field-main">
              {activeEditingRowId !== "phone" ? (
                <div className="settings-field-value">{maskPhone(user.phone)}</div>
              ) : (
                <div className="settings-phone-editor">
                  <AuthPhoneField
                    idPrefix="account-phone"
                    countryCode={phoneCountryCode}
                    localNumber={phoneLocalNumber}
                    onCountryCodeChange={(value) => {
                      setPhoneCountryCode(value);
                      setDrafts((prev) => ({ ...prev, phone: composePhoneValue(value, phoneLocalNumber) }));
                      if (errors.phone) {
                        setErrors((prev) => ({ ...prev, phone: undefined }));
                      }
                    }}
                    onLocalNumberChange={(value) => {
                      setPhoneLocalNumber(value);
                      setDrafts((prev) => ({ ...prev, phone: composePhoneValue(phoneCountryCode, value) }));
                      if (errors.phone) {
                        setErrors((prev) => ({ ...prev, phone: undefined }));
                      }
                    }}
                    inputClassName="settings-input"
                  />
                </div>
              )}
              {errors.phone ? <div className="settings-inline-error">{errors.phone}</div> : null}
            </div>
            <div className="settings-field-actions">
              {activeEditingRowId !== "phone" ? (
                <button className="settings-edit-icon-btn" onClick={() => requestEdit("phone")} aria-label="Edit phone">
                  <PenLine size={14} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={() => {
                    syncPhoneDrafts(user.phone);
                    setActiveEditingRowId(null);
                    setErrors({});
                  }} disabled={saving}>Cancel</button>
                  <button className="vrm-btn vrm-btn-sm" onClick={() => handleSave("phone")} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                </>
              )}
            </div>
          </div>

          <div className={`settings-field-row ${activeEditingRowId !== "password" ? "settings-field-row--readonly" : ""}`}>
            <div className="settings-field-label">Password</div>
            <div className="settings-field-main">
              {activeEditingRowId !== "password" ? (
                <div className="settings-field-value">••••••••</div>
              ) : (
                <div className="settings-password-group">
                  <input className="settings-input" type="password" value={drafts.password} onChange={(e) => setDrafts((prev) => ({ ...prev, password: e.target.value }))} placeholder="New password" />
                  <input className="settings-input" type="password" value={drafts.confirmPassword} onChange={(e) => setDrafts((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Confirm new password" />
                  {errors.password ? <div className="settings-inline-error">{errors.password}</div> : null}
                  {errors.confirmPassword ? <div className="settings-inline-error">{errors.confirmPassword}</div> : null}
                </div>
              )}
            </div>
            <div className="settings-field-actions">
              {activeEditingRowId !== "password" ? (
                <button className="settings-edit-icon-btn" onClick={() => requestEdit("password")} aria-label="Edit password">
                  <PenLine size={14} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={() => { setActiveEditingRowId(null); setDrafts((prev) => ({ ...prev, password: "", confirmPassword: "" })); setErrors({}); }} disabled={saving}>Cancel</button>
                  <button className="vrm-btn vrm-btn-sm" onClick={() => handleSave("password")} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                </>
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
        onVerified={({ unlockToken: verifiedUnlockToken }) => {
          setUnlockSession({
            token: verifiedUnlockToken,
            expiresAt: Date.now() + (INTERNAL_UNLOCK_SESSION_SECONDS * 1000),
          });
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
          return { ok: true as const, unlockToken: result.data.unlockToken, unlockExpiresInSeconds: result.data.unlockExpiresInSeconds };
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
