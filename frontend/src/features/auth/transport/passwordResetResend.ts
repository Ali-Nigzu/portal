export type PasswordResetResendResponse = {
  ok: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  resendsRemaining: number;
};

export const passwordResetResend = async (email: string): Promise<PasswordResetResendResponse> => {
  const response = await fetch("/api/password-reset/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? "Unable to resend reset code");
  }

  return response.json() as Promise<PasswordResetResendResponse>;
};
