export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

export const fetchMe = async () => {
  const response = await fetch('/api/me', { credentials: 'include' });
  if (!response.ok) {
    return { ok: false as const, status: response.status };
  }
  const data = (await response.json()) as { user: AuthUser };
  return { ok: true as const, data };
};

export const logout = async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
};
