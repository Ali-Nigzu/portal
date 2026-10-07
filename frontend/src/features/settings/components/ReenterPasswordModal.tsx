import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import AccessDialog from "../../organisation-access/AccessDialog";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (result: { unlockToken: string; unlockExpiresInSeconds: number }) => void;
  onStartUnlock: (password: string) => Promise<{ ok: true; resendCooldownSeconds: number } | { ok: false; message: string }>;
  onVerifyCode: (code: string) => Promise<{ ok: true; unlockToken: string; unlockExpiresInSeconds: number } | { ok: false; message: string }>;
  onResendCode: () => Promise<{ ok: true; resendCooldownSeconds: number } | { ok: false; message: string }>;
};

export default function ReenterPasswordModal(props: Props) {
  const [step, setStep] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!props.isOpen) { setStep("password"); setPassword(""); setCode(""); setVisible(false); setBusy(false); setError(null); setMessage(null); setCooldown(0); }
  }, [props.isOpen]);
  useEffect(() => { if (props.isOpen) input.current?.focus(); }, [step, props.isOpen]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (step === "password" && !password) { setError("Enter your current password."); return; }
    if (step === "code" && !/^\d{6}$/.test(code)) { setError("Enter your 6-digit verification code."); return; }
    setBusy(true); setError(null);
    try {
      if (step === "password") {
        const result = await props.onStartUnlock(password);
        if (!result.ok) { setError(result.message); return; }
        setPassword(""); setStep("code"); setCooldown(result.resendCooldownSeconds);
        setMessage("We sent a verification code to your account email.");
      } else {
        const result = await props.onVerifyCode(code);
        if (!result.ok) { setError(result.message); return; }
        props.onVerified(result);
      }
    } catch { setError("Unable to complete the request. Please try again."); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (busy || cooldown) return;
    setBusy(true); setError(null);
    try {
      const result = await props.onResendCode();
      if (!result.ok) { setError(result.message); return; }
      setCooldown(result.resendCooldownSeconds); setMessage("A new verification code was sent.");
    } catch { setError("Unable to resend. Please try again."); }
    finally { setBusy(false); }
  };
  if (!props.isOpen) return null;
  return <AccessDialog title={step === "password" ? "Unlock to edit" : "Verify your account"}
    description={step === "password" ? "Confirm your password, then verify the code sent to your email." : "Enter the 6-digit code. Editing stays unlocked for five minutes."}
    busy={busy} onClose={props.onClose}>
    <form className="settings-form-grid" onSubmit={submit}>
      <div className="settings-form-field">
        <label className="settings-form-label" htmlFor="account-unlock-input">{step === "password" ? "Current password" : "Verification code"}</label>
        <div className={step === "password" ? "account-password-input" : undefined}>
          <input ref={input} data-autofocus id="account-unlock-input" className="settings-input"
            type={step === "password" && !visible ? "password" : "text"} inputMode={step === "code" ? "numeric" : undefined}
            autoComplete={step === "password" ? "current-password" : "one-time-code"} disabled={busy}
            value={step === "password" ? password : code} maxLength={step === "password" ? 1024 : 6}
            onChange={event => step === "password" ? setPassword(event.target.value) : setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-invalid={Boolean(error)} aria-describedby={error ? "account-unlock-error" : undefined} />
          {step === "password" && <button type="button" disabled={busy} onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide current password" : "Show current password"} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
        </div>
      </div>
      {error && <p id="account-unlock-error" className="settings-form-error" role="alert">{error}</p>}
      {message && <p className="settings-form-message" role="status">{message}</p>}
      <div className="settings-form-actions">
        <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" disabled={busy} onClick={props.onClose}>Cancel</button>
        {step === "code" && <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" disabled={busy || cooldown > 0} onClick={resend}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button>}
        <button className="vrm-btn vrm-btn-sm" disabled={busy}>{busy ? "Verifying…" : step === "password" ? "Continue" : "Unlock"}</button>
      </div>
    </form>
  </AccessDialog>;
}
