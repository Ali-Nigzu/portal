import { DocumentItem, UploadError } from "../types";

const responseError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => null);
  return new Error(typeof body?.detail === "string" ? body.detail : fallback);
};

export const listDocuments = async (): Promise<DocumentItem[]> => {
  const response = await fetch("/api/documents", { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    throw await responseError(response, "Unable to load documents. Please try again.");
  }
  const data = (await response.json()) as { documents: DocumentItem[] };
  return data.documents;
};

export const uploadDocuments = async (files: File[]) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const response = await fetch("/api/documents/upload", {
    method: "POST",
    headers: { "X-Requested-With": "camOS" },
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    throw await responseError(response, "Unable to upload documents. Please try again.");
  }

  const data = (await response.json()) as {
    documents: DocumentItem[];
    errors?: UploadError[];
  };

  return {
    documents: data.documents,
    errors: data.errors ?? [],
  };
};

export const deleteDocument = async (documentId: string): Promise<void> => {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers: { "X-Requested-With": "camOS" },
    credentials: "include",
  });
  if (!response.ok) {
    throw await responseError(response, "Unable to delete document. Refresh and try again.");
  }
};

export const getDownloadUrl = (documentId: string) =>
  `/api/documents/${encodeURIComponent(documentId)}/download`;
