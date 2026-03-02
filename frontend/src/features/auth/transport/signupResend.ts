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
      "Content-Type": "application/json",
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
