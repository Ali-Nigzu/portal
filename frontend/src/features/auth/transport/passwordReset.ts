

export type PasswordResetStartResponse = {
  ok: boolean;
  email: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
};

export const passwordResetStart = async (email: string): Promise<PasswordResetStartResponse> => {
  const response = await fetch("/api/password-reset/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? "Unable to send reset code");
  }

  return response.json() as Promise<PasswordResetStartResponse>;
};

export type PasswordResetResendResponse = {
  ok: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  resendsRemaining: number;
};

export const passwordResetResend = async (email: string): Promise<PasswordResetResendResponse> => {
  const response = await fetch("/api/password-reset/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? "Unable to resend reset code");
  }

  return response.json() as Promise<PasswordResetResendResponse>;
};

export type PasswordResetVerifyCodeResponse = {
  ok: boolean;
  resetExpiresInSeconds: number;
};

export const passwordResetVerifyCode = async (payload: {
  email: string;
  code: string;
}): Promise<PasswordResetVerifyCodeResponse> => {
  const response = await fetch('/api/password-reset/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'camOS' },
    credentials: 'include',
    body: JSON.stringify({ ...payload, email: payload.email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? 'Unable to verify reset code');
  }

  return response.json() as Promise<PasswordResetVerifyCodeResponse>;
};

export type PasswordResetSetPasswordResponse = { ok: boolean };

export const passwordResetSetPassword = async (payload: {
  email: string;
  password: string;
  confirm_password: string;
}): Promise<PasswordResetSetPasswordResponse> => {
  const response = await fetch('/api/password-reset/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'camOS' },
    credentials: 'include',
    body: JSON.stringify({ ...payload, email: payload.email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? 'Unable to set a new password');
  }

  return response.json() as Promise<PasswordResetSetPasswordResponse>;
};
