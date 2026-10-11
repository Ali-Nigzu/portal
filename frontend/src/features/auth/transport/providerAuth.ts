export type Provider = "google" | "microsoft";
export type ProviderRequired = {
  error: "provider_required";
  message: string;
  providers: Provider[];
};

export function isProviderRequired(value: unknown): value is ProviderRequired {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ProviderRequired>;
  return (
    data.error === "provider_required" &&
    Array.isArray(data.providers) &&
    data.providers.every(
      (provider) => provider === "google" || provider === "microsoft",
    )
  );
}

export class AuthRequestError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    const detail =
      data && typeof data === "object"
        ? (data as { detail?: unknown }).detail
        : null;
    super(
      typeof detail === "string"
        ? detail
        : "Unable to complete sign-in. Please try again.",
    );
  }
}

export async function providerRequest<T>(
  path: string,
  method = "GET",
  payload?: object,
): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method,
    credentials: "include",
    headers:
      method === "GET"
        ? {}
        : {
            "X-Requested-With": "camOS",
            ...(payload ? { "Content-Type": "application/json" } : {}),
          },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data: unknown =
    response.status === 204
      ? undefined
      : await response.json().catch(() => null);
  if (!response.ok) throw new AuthRequestError(response.status, data);
  return data as T;
}
