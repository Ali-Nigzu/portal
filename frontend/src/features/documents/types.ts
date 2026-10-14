type DocumentType = "pdf" | "csv" | "xlsx" | "docx" | "other";

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
  index: number;
  filename: string;
  code: "unsupported_type" | "too_large" | "unsafe_filename" | "duplicate_filename" | "storage_unavailable" | "request_unknown" | "not_sent";
  message: string;
  outcome?: "failed" | "unknown" | "not_sent";
};

export type PendingUploadItem = {
  localId: string;
  file: File;
  status: "ready" | "uploading" | "failed" | "unknown";
  error?: string;
};

export const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".docx"];
