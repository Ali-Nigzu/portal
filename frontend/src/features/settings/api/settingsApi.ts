import { accountFetch, RequestFailure } from "../../auth/transport/me";
import { type AuthUser } from "../../auth/transport/me";

export const getMe = async (signal?: AbortSignal): Promise<AuthUser> => {
  const response = await accountFetch('/api/me', { signal, credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error("Please try again.");
  }
  return (await response.json() as {user: AuthUser}).user;
};

export const startSettingsUnlock = async (currentPassword?: string, signal?: AbortSignal): Promise<SettingsUnlockStartResult> => {
  const response = await accountFetch("/api/settings/unlock/start", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify(currentPassword === undefined ? {} : { current_password: currentPassword }),
  });

  if (!response.ok) {
    if (response.status >= 500) throw new RequestFailure(true);
    let message: string | undefined;
    try {
      const data = (await response.json()) as { detail?: string };
      message = typeof data.detail === "string" ? data.detail : undefined;
    } catch {
      message = undefined;
    }
    return { ok: false, status: response.status, message };
  }

  const data = await response.json() as {
    ok: boolean;
    expiresInSeconds: number;
    resendCooldownSeconds: number;
  };

  return { ok: true, data };
};

export const resendSettingsUnlockCode = async (signal?: AbortSignal): Promise<SettingsUnlockResendResult> => {
  const response = await accountFetch("/api/settings/unlock/resend", {
    method: "POST",
    signal,
    headers: { "X-Requested-With": "camOS" },
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status >= 500) throw new RequestFailure(true);
    let message: string | undefined;
    try {
      const data = (await response.json()) as { detail?: string };
      message = typeof data.detail === "string" ? data.detail : undefined;
    } catch {
      message = undefined;
    }
    return { ok: false, status: response.status, message };
  }

  const data = await response.json() as {
    ok: boolean;
    expiresInSeconds: number;
    resendCooldownSeconds: number;
    resendsRemaining: number;
  };
  return { ok: true, data };
};

export const verifySettingsUnlockCode = async (code: string, signal?: AbortSignal): Promise<SettingsUnlockVerifyResult> => {
  const response = await accountFetch("/api/settings/unlock/verify", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify({ code: code.trim() }),
  });

  if (!response.ok) {
    if (response.status >= 500) throw new RequestFailure(true);
    let message: string | undefined;
    try {
      const data = (await response.json()) as { detail?: string };
      message = typeof data.detail === "string" ? data.detail : undefined;
    } catch {
      message = undefined;
    }
    return { ok: false, status: response.status, message };
  }

  const data = await response.json() as {
    ok: boolean;
    unlockToken: string;
    unlockExpiresInSeconds: number;
  };

  return { ok: true, data };
};

export const updateMe = async (payload: UpdateMePayload, signal?: AbortSignal): Promise<AuthUser> => {
  const response = await accountFetch("/api/me", {
    method: "PUT",
    signal,
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status >= 500) throw new RequestFailure(true);
    let message = "Unable to save";
    try {
      const data = (await response.json()) as { detail?: string };
      if (typeof data.detail === "string") {
        message = data.detail;
      }
    } catch {
      // noop
    }
    throw new Error(message);
  }

  const data = await response.json() as { user: AuthUser };
  return data.user;
};

export const endSettingsUnlock = async (signal?: AbortSignal): Promise<void> => {
  const response = await accountFetch("/api/settings/unlock/end", {
    method: "POST",
    signal,
    headers: { "X-Requested-With": "camOS" },
    credentials: "include",
  });
  if (!response.ok) throw new Error("Unable to lock editing. Please try again.");
};

export type UpdateMePayload = {
  name?: string;
  phone?: string;
  password?: string;
  confirm_password?: string;
  unlock_token: string;
};

type SettingsUnlockStartResult =
  | {
      ok: true;
      data: {
        ok: boolean;
        expiresInSeconds: number;
        resendCooldownSeconds: number;
      };
    }
  | { ok: false; status: number; message?: string };

type SettingsUnlockResendResult =
  | {
      ok: true;
      data: {
        ok: boolean;
        expiresInSeconds: number;
        resendCooldownSeconds: number;
        resendsRemaining: number;
      };
    }
  | { ok: false; status: number; message?: string };

type SettingsUnlockVerifyResult =
  | {
      ok: true;
      data: {
        ok: boolean;
        unlockToken: string;
        unlockExpiresInSeconds: number;
      };
    }
  | { ok: false; status: number; message?: string };
