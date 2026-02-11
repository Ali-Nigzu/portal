export type RegisterInterestPayload = {
  name: string;
  email: string;
  company: string;
  phone?: string;
};

type RegisterInterestResult =
  | { ok: true }
  | { ok: false };

export const registerInterest = async (
  payload: RegisterInterestPayload,
): Promise<RegisterInterestResult> => {
  const response = await fetch("/api/register-interest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { ok: false };
  }

  return { ok: true };
};
