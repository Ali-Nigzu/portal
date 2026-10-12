export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  has_password: boolean;
};

export const fetchMe = async (signal?: AbortSignal) => {
  const response = await fetch('/api/me', { signal, credentials: 'include' });
  if (!response.ok) {
    return { ok: false as const, status: response.status };
  }
  const data = (await response.json()) as { user: AuthUser };
  return { ok: true as const, data };
};

export const logout = async () => {
  const response = await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'camOS' }, credentials: 'include' });
  if (response.status !== 204) throw new Error('Unable to log out. Please try again.');
};
