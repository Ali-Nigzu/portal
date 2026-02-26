export type DocumentType = "pdf" | "csv" | "xlsx" | "docx" | "other";

export type DocumentItem = {
  id: string;
  accountId: string;
  name: string;
  type: DocumentType;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  status: "active" | "deleted";
};

export type UploadError = {
  filename: string;
  code: "unsupported_type" | "too_large" | "internal";
  message: string;
};

export type PendingUploadItem = {
  localId: string;
  file: File;
  status: "ready" | "uploading" | "failed";
  error?: string;
};

export const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".docx"];
