export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  has_password: boolean;
};

type AccountBinding = { id: string; signal: AbortSignal };
let accountBinding: AccountBinding | null = null;

export function bindAccountRequests(id: string | null, signal: AbortSignal) {
  accountBinding = id === null ? null : { id, signal };
}

export class RequestFailure extends Error {
  constructor(public uncertain: boolean) {
    super(uncertain ? "Please check before trying again." : "Please try again.");
  }
}

// Bound waiting includes the response body. Existing callers already consume
// these JSON/CSV responses in full; native document downloads remain streamed.
export async function requestFetch(input: RequestInfo | URL, init: RequestInit = {}, timeout = 30_000): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) cancel();
  const timer = window.setTimeout(cancel, timeout);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = response.status === 204 || response.status === 205 || response.status === 304 ? null : await response.arrayBuffer();
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw new RequestFailure(!["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase()));
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", cancel);
  }
}

export async function accountFetch(input: RequestInfo | URL, init: RequestInit = {}, timeout = 12_000): Promise<Response> {
  const actor = accountBinding;
  if (!actor || actor.signal.aborted) throw new DOMException("Aborted", "AbortError");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  for (const signal of [actor.signal, init.signal]) {
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  }
  const headers = new Headers(init.headers);
  headers.set("X-camos-account-id", actor.id);
  try {
    const response = await requestFetch(input, { ...init, headers, signal: controller.signal }, timeout);
    if (actor.signal.aborted || accountBinding?.signal !== actor.signal) throw new DOMException("Aborted", "AbortError");
    const reason = response.headers.get("X-camos-auth-error");
    if (reason === "session_invalid" || reason === "account_changed" || response.status === 401) {
      window.dispatchEvent(new CustomEvent("camos:account-rejected", { detail: { signal: actor.signal, reason: reason ?? "check" } }));
      if (reason) throw new DOMException("Aborted", "AbortError");
    }
    return response;
  } finally {
    for (const signal of [actor.signal, init.signal]) signal?.removeEventListener("abort", cancel);
  }
}

export const fetchMe = async (signal?: AbortSignal) => {
  const response = await requestFetch('/api/me', { signal, credentials: 'include', cache: 'no-store' }, 12_000);
  if (!response.ok) {
    return { ok: false as const, status: response.status };
  }
  const data = (await response.json()) as { user: AuthUser };
  return { ok: true as const, data };
};

export const logout = async () => {
  const actor = accountBinding;
  const response = await requestFetch('/api/logout', { method: 'POST', headers: {
    'X-Requested-With': 'camOS', ...(actor ? { 'X-camos-account-id': actor.id } : {}),
  }, credentials: 'include' }, 30_000);
  if (response.status !== 204) throw new Error('Unable to log out. Please try again.');
};
