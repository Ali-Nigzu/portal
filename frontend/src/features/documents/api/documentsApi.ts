import { DocumentItem, UploadError } from "../types";

export const listDocuments = async (): Promise<DocumentItem[]> => {
  const response = await fetch("/api/documents", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to load documents (${response.status})`);
  }
  const data = (await response.json()) as { documents: DocumentItem[] };
  return data.documents;
};

export const uploadDocuments = async (files: File[]) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const response = await fetch("/api/documents/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to upload documents (${response.status})`);
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
  const response = await fetch(`/api/documents/${documentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete document (${response.status})`);
  }
};

export const getDownloadUrl = (documentId: string) =>
  `/api/documents/${documentId}/download`;
