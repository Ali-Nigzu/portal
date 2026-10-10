

export type SignupStartPayload = {
  name: string;
  email: string;
  phone?: string;
  password: string;
};

export type SignupStartData = {
  ok: boolean;
  email: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
};

export type SignupStartResult =
  | { ok: true; data: SignupStartData }
  | { ok: false; status: number; message?: string };

export const signupStart = async (
  payload: SignupStartPayload,
): Promise<SignupStartResult> => {
  const response = await fetch("/api/signup/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify({
      ...payload,
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone?.trim() || undefined,
    }),
  });

  if (!response.ok) {
    let message: string | undefined;
    try {
      const data = (await response.json()) as { detail?: string };
      message = data.detail;
    } catch {
      message = undefined;
    }
    return { ok: false, status: response.status, message };
  }

  const data = (await response.json()) as SignupStartData;
  return { ok: true, data };
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

export type SignupVerifyData = {
  user: AuthUser;
};

export type SignupVerifyResult =
  | { ok: true; data: SignupVerifyData }
  | { ok: false; status: number; message?: string };

export const signupVerify = async (
  email: string,
  code: string,
): Promise<SignupVerifyResult> => {
  const response = await fetch("/api/signup/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Requested-With": "camOS",
    },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
  });

  if (!response.ok) {
    let message: string | undefined;
    try {
      const data = (await response.json()) as { detail?: string };
      message = data.detail;
    } catch {
      message = undefined;
    }
    return { ok: false, status: response.status, message };
  }

  const data = (await response.json()) as SignupVerifyData;
  return { ok: true, data };
};

export type SignupResendData = {
  ok: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  resendsRemaining: number;
};

export type SignupResendResult =
  | { ok: true; data: SignupResendData }
  | { ok: false; status: number; message?: string };

export const signupResend = async (email: string): Promise<SignupResendResult> => {
  const response = await fetch("/api/signup/resend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Requested-With": "camOS",
    },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    let message: string | undefined;
    try {
      const data = (await response.json()) as { detail?: string };
      message = data.detail;
    } catch {
      message = undefined;
    }
    return { ok: false, status: response.status, message };
  }

  const data = (await response.json()) as SignupResendData;
  return { ok: true, data };
};
