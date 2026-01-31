type LoginResponse = {
  user?: {
    orgId?: string;
    org_id?: string;
    table_name?: string;
  };
};

type LoginResult =
  | { ok: true; data: LoginResponse }
  | { ok: false; status: number };

export const login = async (
  username: string,
  password: string,
): Promise<LoginResult> => {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const data = (await response.json()) as LoginResponse;
  return { ok: true, data };
};
