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
    headers: { "Content-Type": "application/json" },
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
