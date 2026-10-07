import { fetchMe } from "../../auth/transport/me";
import type {
  SettingsUnlockStartResult,
  SettingsUnlockVerifyResult,
  SettingsUnlockResendResult,
  SettingsUser,
  UpdateMePayload,
} from "../types";

export const getMe = async (): Promise<SettingsUser> => {
  const response = await fetchMe();
  if (!response.ok) {
    throw new Error("Unable to load account details");
  }
  return response.data.user;
};

export const startSettingsUnlock = async (currentPassword: string): Promise<SettingsUnlockStartResult> => {
  const response = await fetch("/api/settings/unlock/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify({ current_password: currentPassword }),
  });

  if (!response.ok) {
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

export const resendSettingsUnlockCode = async (): Promise<SettingsUnlockResendResult> => {
  const response = await fetch("/api/settings/unlock/resend", {
    method: "POST",
    headers: { "X-Requested-With": "camOS" },
    credentials: "include",
  });

  if (!response.ok) {
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

export const verifySettingsUnlockCode = async (code: string): Promise<SettingsUnlockVerifyResult> => {
  const response = await fetch("/api/settings/unlock/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify({ code: code.trim() }),
  });

  if (!response.ok) {
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

export const updateMe = async (payload: UpdateMePayload): Promise<SettingsUser> => {
  const response = await fetch("/api/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Requested-With": "camOS" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
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

  const data = await response.json() as { user: SettingsUser };
  return data.user;
};
