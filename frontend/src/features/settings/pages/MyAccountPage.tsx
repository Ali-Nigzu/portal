import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole, PenLine, ShieldCheck } from "lucide-react";
import { useAuthenticatedApplication } from "../../../context/AuthenticatedApplicationContext";
import { getMe, resendSettingsUnlockCode, startSettingsUnlock, updateMe, verifySettingsUnlockCode } from "../api/settingsApi";
import EditableFieldRow from "../components/EditableFieldRow";
import ReenterPasswordModal from "../components/ReenterPasswordModal";
import SettingsFrame from "../components/SettingsFrame";
import SettingsPageHeader from "../components/SettingsPageHeader";
import type { SettingsUser, UpdateMePayload } from "../types";
import AuthPhoneField from "../../auth/components/AuthPhoneField";
import { PHONE_OPTION_BY_ISO, inferIsoFromPhoneText, replaceDialCodeInPhoneText, sanitizePhoneText } from "../../auth/countryPhoneData";
import "../../auth/components/AuthPhoneField.css";
import "../SettingsPages.css";
import "../MyAccount.css";

type Row = "name" | "phone" | "password";
type Errors = Partial<Record<Row | "confirmPassword" | "form", string>>;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

export default function MyAccountPage() {
  const { refreshAccount } = useAuthenticatedApplication();
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [requestedRow, setRequestedRow] = useState<Row | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlock, setUnlock] = useState<{ token: string; expires: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneIso, setPhoneIso] = useState("GB");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const passwordButton = useRef<HTMLButtonElement>(null);
  const phoneButton = useRef<HTMLButtonElement>(null);
  const unlocked = Boolean(unlock && unlock.expires > Date.now());

  const resetDrafts = (account: SettingsUser) => {
    setName(account.name); setPhone(account.phone ?? "");
    setPhoneIso(inferIsoFromPhoneText(account.phone ?? "") ?? "GB");
    setPassword(""); setConfirmPassword(""); setShowPassword(false); setShowConfirmation(false);
  };

  useEffect(() => {
    let active = true;
    setLoadError(null);
    getMe().then(account => { if (active) { setUser(account); resetDrafts(account); } })
      .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Unable to load account"); });
    return () => { active = false; };
  }, [loadRevision]);

  useEffect(() => {
    if (!unlock) return;
    const timer = window.setTimeout(() => {
      setUnlock(null); setEditing(null); setPassword(""); setConfirmPassword("");
      setErrors({ form: "Your editing session expired. Unlock again to continue." });
    }, Math.max(0, unlock.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [unlock]);

  useEffect(() => {
    if (editing === "password") passwordInput.current?.focus();
  }, [editing]);

  const cancel = () => {
    if (user) resetDrafts(user);
    const row = editing;
    setEditing(null); setErrors({});
    requestAnimationFrame(() => {
      if (row === "password") passwordButton.current?.focus();
      if (row === "phone") phoneButton.current?.focus();
    });
  };

  const edit = (row: Row) => {
    if (saving) return;
    if (user) resetDrafts(user);
    setErrors({}); setMessage(null);
    if (!unlocked) { setRequestedRow(row); setUnlockOpen(true); return; }
    setEditing(row);
  };

  const save = async (row: Row) => {
    if (!user || !unlock || !unlocked || saving) return;
    const next: Errors = {};
    const payload: UpdateMePayload = { unlock_token: unlock.token, account_version: user.account_version };
    if (row === "name") {
      if (!name.trim()) next.name = "Enter a username.";
      else payload.name = name.trim();
    }
    if (row === "phone") {
      const value = sanitizePhoneText(phone);
      if (value && !PHONE_RE.test(value)) next.phone = "Use an international phone number, such as +447700900123.";
      else payload.phone = value;
    }
    if (row === "password") {
      if (password.length < 8) next.password = "Use at least 8 characters.";
      if (password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
      payload.password = password; payload.confirm_password = confirmPassword;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true); setMessage(null);
    try {
      const account = await updateMe(payload);
      setUser(account); resetDrafts(account); setEditing(null);
      if (row === "password") setUnlock(null);
      setMessage(row === "password" ? "Password changed. Your other sessions have been signed out." : "Account details saved.");
      await refreshAccount?.();
      requestAnimationFrame(() => {
        if (row === "phone") phoneButton.current?.focus();
        if (row === "password") passwordButton.current?.focus();
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to save. Please try again.";
      if (/unlock|unauthenticated/i.test(detail)) { setUnlock(null); setEditing(null); setPassword(""); setConfirmPassword(""); }
      setErrors({ form: detail });
    } finally { setSaving(false); }
  };

  if (!user || loadError) return <SettingsFrame>
    <SettingsPageHeader title="My Account" />
    <div className="vrm-card account-loading" aria-busy={!loadError}>
      <div className="vrm-card-body">
        {loadError ? <><p role="alert">{loadError}</p><button className="vrm-btn" onClick={() => setLoadRevision(value => value + 1)}>Try again</button></>
          : <><p role="status">Loading your account…</p><div className="account-skeleton" /><div className="account-skeleton" /><div className="account-skeleton" /></>}
      </div>
    </div>
  </SettingsFrame>;

  return <SettingsFrame>
    <SettingsPageHeader title="My Account" action={<div className="account-unlock-actions">
      {unlocked ? <><span className="account-unlocked"><ShieldCheck size={16} aria-hidden="true" /> Editing unlocked</span>
        <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" disabled={saving} onClick={() => { cancel(); setUnlock(null); }}>Lock editing</button></>
        : <button className="vrm-btn vrm-btn-sm" onClick={() => { setRequestedRow(null); setUnlockOpen(true); }}><LockKeyhole size={16} aria-hidden="true" /> Unlock to edit</button>}
    </div>} />
    <section className="vrm-card account-details" aria-labelledby="account-details-title" aria-busy={saving}>
      <div className="vrm-card-header account-card-heading"><div><h2 id="account-details-title" className="vrm-card-title">Account details</h2><p>Your personal details across camOS.</p></div></div>
      <div className="vrm-card-body settings-account-card-body">
        <EditableFieldRow label="Username" displayValue={user.name} value={name} isEditing={editing === "name"}
          isSaving={saving} error={errors.name} onEdit={() => edit("name")} onCancel={cancel} onSave={() => save("name")} onChange={setName} />
        <div className="settings-field-row settings-field-row--readonly">
          <div className="settings-field-label">Email</div><div className="settings-field-main">
            <div className="settings-field-value account-email">{user.email}</div><div className="settings-field-help">Your sign-in email. It cannot be changed from My Account.</div>
          </div><div className="settings-field-actions" aria-hidden="true" />
        </div>
        <div className={`settings-field-row ${editing === "phone" ? "settings-field-row--editing" : "settings-field-row--readonly"}`}>
          <div className="settings-field-label">Phone</div><div className="settings-field-main">
            {editing === "phone" ? <><AuthPhoneField idPrefix="my-account" selectedIso={phoneIso} phoneText={phone}
              onSelectedIsoChange={iso => { const option = PHONE_OPTION_BY_ISO.get(iso); if (option) { setPhoneIso(iso); setPhone(value => replaceDialCodeInPhoneText(value, option.dialCode)); } }}
              onPhoneTextChange={value => { const cleaned = sanitizePhoneText(value); setPhone(cleaned); const iso = inferIsoFromPhoneText(cleaned); if (iso) setPhoneIso(iso); }}
              inputClassName="settings-input" error={errors.phone} disabled={saving} />
              <button type="button" className="account-text-button" disabled={saving || !phone} onClick={() => setPhone("")}>Remove phone number</button></>
              : <><div className={`settings-field-value ${!user.phone ? "account-empty" : ""}`}>{user.phone || "Not added"}</div><div className="settings-field-help">Optional contact number.</div></>}
          </div><div className="settings-field-actions">
            {editing === "phone" ? <><button className="vrm-btn vrm-btn-secondary vrm-btn-sm" disabled={saving} onClick={cancel}>Cancel</button><button className="vrm-btn vrm-btn-sm" disabled={saving || phone === (user.phone ?? "")} onClick={() => save("phone")}>{saving ? "Saving…" : "Save"}</button></>
              : <button ref={phoneButton} className="settings-edit-icon-btn" disabled={saving} onClick={() => edit("phone")} aria-label="Edit phone"><PenLine size={16} aria-hidden="true" /></button>}
          </div>
        </div>
      </div>
    </section>
    <section className="vrm-card account-security" aria-labelledby="account-security-title">
      <div className="vrm-card-header account-card-heading"><div><h2 id="account-security-title" className="vrm-card-title">Security</h2><p>Keep your account protected.</p></div></div>
      <div className="vrm-card-body account-security-body">
        {editing !== "password" ? <div className="account-password-summary"><div><h3>Password</h3><p>Choose a unique password you do not use elsewhere.</p></div><button ref={passwordButton} className="vrm-btn vrm-btn-secondary vrm-btn-sm" disabled={saving} onClick={() => edit("password")}>Change password</button></div>
          : <form className="account-password-form" onSubmit={event => { event.preventDefault(); save("password"); }} onKeyDown={event => { if (event.key === "Escape" && !saving) { event.preventDefault(); cancel(); } }}>
            <p className="settings-field-help">Use at least 8 characters. Changing your password signs out your other sessions.</p>
            {[{ id: "account-password", label: "New password", value: password, change: setPassword, visible: showPassword, toggle: () => setShowPassword(value => !value), error: errors.password },
              { id: "account-confirm-password", label: "Confirm new password", value: confirmPassword, change: setConfirmPassword, visible: showConfirmation, toggle: () => setShowConfirmation(value => !value), error: errors.confirmPassword }].map((field, index) => <div className="settings-form-field" key={field.id}>
              <label className="settings-form-label" htmlFor={field.id}>{field.label}</label><div className="account-password-input">
                <input ref={index === 0 ? passwordInput : undefined} id={field.id} className="settings-input" type={field.visible ? "text" : "password"} autoComplete="new-password" maxLength={1024} disabled={saving} value={field.value} onChange={event => field.change(event.target.value)} aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${field.id}-error` : undefined} />
                <button type="button" disabled={saving} onClick={field.toggle} aria-label={`${field.visible ? "Hide" : "Show"} ${field.label.toLowerCase()}`} aria-pressed={field.visible}>{field.visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>{field.error && <p id={`${field.id}-error`} className="settings-inline-error">{field.error}</p>}
            </div>)}
            <div className="settings-form-actions"><button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" disabled={saving} onClick={cancel}>Cancel</button><button className="vrm-btn vrm-btn-sm" disabled={saving}>{saving ? "Saving…" : "Save password"}</button></div>
          </form>}
      </div>
    </section>
    <div className="account-feedback" aria-live="polite">
      {errors.form && <p role="alert" className="settings-form-error">{errors.form} {/changed elsewhere/.test(errors.form) && <button className="account-text-button" onClick={() => { cancel(); setLoadRevision(value => value + 1); }}>Reload account</button>}</p>}
      {message && <p role="status" className="settings-form-message">{message}</p>}
    </div>
    <ReenterPasswordModal isOpen={unlockOpen} onClose={() => { setUnlockOpen(false); setRequestedRow(null); }}
      onVerified={result => { setUnlock({ token: result.unlockToken, expires: Date.now() + result.unlockExpiresInSeconds * 1000 }); setUnlockOpen(false); setErrors({}); setEditing(requestedRow); setRequestedRow(null); }}
      onStartUnlock={async value => { const result = await startSettingsUnlock(value); return result.ok ? { ok: true, resendCooldownSeconds: result.data.resendCooldownSeconds } : { ok: false, message: result.message || "Unable to verify password" }; }}
      onVerifyCode={async value => { const result = await verifySettingsUnlockCode(value); return result.ok ? { ok: true, unlockToken: result.data.unlockToken, unlockExpiresInSeconds: result.data.unlockExpiresInSeconds } : { ok: false, message: result.message || "Unable to verify code" }; }}
      onResendCode={async () => { const result = await resendSettingsUnlockCode(); return result.ok ? { ok: true, resendCooldownSeconds: result.data.resendCooldownSeconds } : { ok: false, message: result.message || "Unable to resend code" }; }} />
  </SettingsFrame>;
}
