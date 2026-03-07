export type PasswordResetVerifyResponse = { ok: boolean };

export const passwordResetVerify = async (payload: {
  email: string;
  code: string;
  password: string;
  confirm_password: string;
}): Promise<PasswordResetVerifyResponse> => {
  const response = await fetch("/api/password-reset/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...payload, email: payload.email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? "Unable to verify reset code");
  }

  return response.json() as Promise<PasswordResetVerifyResponse>;
};
