import { AuthRequestError } from "./providerAuth";
type ResetCodeResponse = {
  ok: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
};

async function postReset<T>(action: string, payload?: object): Promise<T> {
  const response = await fetch(`/api/password-reset/${action}`, {
    method: "POST",
    headers: {
      "X-Requested-With": "camOS",
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    credentials: "include",
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new AuthRequestError(response.status, error);
  }
  return response.json() as Promise<T>;
}

export const passwordResetStart = (email: string) =>
  postReset<ResetCodeResponse>("start", { email: email.trim() });

export const passwordResetResend = () => postReset<ResetCodeResponse>("resend");

export const passwordResetVerifyCode = (payload: { code: string }) =>
  postReset<{ ok: boolean; resetExpiresInSeconds: number }>(
    "verify-code",
    payload,
  );

export const passwordResetSetPassword = (payload: {
  password: string;
  confirm_password: string;
}) => postReset<{ ok: boolean }>("set-password", payload);
