type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

export type SignupVerifyData = {
  user: AuthUser;
};

export type SignupVerifyResult =
  | { ok: true; data: SignupVerifyData }
  | { ok: false; status: number; message?: string };

export const signupVerify = async (
  email: string,
  code: string,
): Promise<SignupVerifyResult> => {
  const response = await fetch("/api/signup/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
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

  const data = (await response.json()) as SignupVerifyData;
  return { ok: true, data };
};
