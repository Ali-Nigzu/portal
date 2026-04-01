export type ContactPayload = {
  name: string;
  email: string;
  phone?: string;
  message: string;
  attachments: File[];
};

export type ContactResult =
  | { ok: true; message: string }
  | { ok: false; status: number; message: string };

export const submitContact = async (payload: ContactPayload): Promise<ContactResult> => {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("email", payload.email);
  if (payload.phone?.trim()) {
    formData.append("phone", payload.phone.trim());
  }
  formData.append("message", payload.message);
  payload.attachments.forEach((file) => formData.append("attachments", file));

  const response = await fetch("/api/contact", {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  const message = typeof data?.message === "string"
    ? data.message
    : typeof data?.detail === "string"
      ? data.detail
      : "Unable to send your message. Please try again.";

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message,
    };
  }

  return {
    ok: true,
    message,
  };
};
