type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

type LoginResponse = {
  user: AuthUser;
};

type LoginResult =
  | { ok: true; data: LoginResponse }
  | { ok: false; status: number };

export const login = async (
  email: string,
  password: string,
): Promise<LoginResult> => {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const data = (await response.json()) as LoginResponse;
  return { ok: true, data };
};
