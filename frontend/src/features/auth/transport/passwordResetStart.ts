export type PasswordResetStartResponse = {
  ok: boolean;
  email: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
};

export const passwordResetStart = async (email: string): Promise<PasswordResetStartResponse> => {
  const response = await fetch("/api/password-reset/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? "Unable to send reset code");
  }

  return response.json() as Promise<PasswordResetStartResponse>;
};
