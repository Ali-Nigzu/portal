export type PasswordResetVerifyCodeResponse = {
  ok: boolean;
  resetToken: string;
  resetExpiresInSeconds: number;
};

export const passwordResetVerifyCode = async (payload: {
  email: string;
  code: string;
}): Promise<PasswordResetVerifyCodeResponse> => {
  const response = await fetch('/api/password-reset/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...payload, email: payload.email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? 'Unable to verify reset code');
  }

  return response.json() as Promise<PasswordResetVerifyCodeResponse>;
};
