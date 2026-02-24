type CreateAccountPayload = {
  name: string;
  email: string;
  phone?: string;
  password: string;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

type CreateAccountResponse = {
  user: AuthUser;
};

export const createAccount = async (payload: CreateAccountPayload) => {
  const response = await fetch("/api/create-account", {
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
    return { ok: false as const, status: response.status };
  }

  const data = (await response.json()) as CreateAccountResponse;
  return { ok: true as const, data };
};
