export type DocumentItem = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
  source: "local";
  file: File;
};

export type DocumentsState = "EMPTY" | "HAS_DOCS";

export const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".docx"];
