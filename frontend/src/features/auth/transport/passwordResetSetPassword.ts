export type PasswordResetSetPasswordResponse = { ok: boolean };

export const passwordResetSetPassword = async (payload: {
  email: string;
  reset_token: string;
  password: string;
  confirm_password: string;
}): Promise<PasswordResetSetPasswordResponse> => {
  const response = await fetch('/api/password-reset/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...payload, email: payload.email.trim().toLowerCase() }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail ?? 'Unable to set a new password');
  }

  return response.json() as Promise<PasswordResetSetPasswordResponse>;
};
