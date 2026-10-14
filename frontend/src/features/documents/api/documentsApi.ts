import { accountFetch, RequestFailure } from "../../auth/transport/me";
import { DocumentItem, UploadError } from "../types";

const responseError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => null);
  return new Error(typeof body?.detail === "string" ? body.detail : fallback);
};

export const listDocuments = async (signal: AbortSignal, accountId: string): Promise<DocumentItem[]> => {
  const response = await accountFetch("/api/documents", { signal, credentials: "include", cache: "no-store" }, 60_000);
  if (!response.ok) {
    throw await responseError(response, "Unable to load documents. Please try again.");
  }
  const data = (await response.json()) as { documents: DocumentItem[] };
  if (!Array.isArray(data.documents) || data.documents.some(item => item.accountId !== accountId)) throw new Error("Please try again.");
  return data.documents;
};

export const uploadDocuments = async (files: File[], accountId: string, signal: AbortSignal, onUploaded: (documents: DocumentItem[]) => void) => {
  const documents: DocumentItem[] = [], errors: UploadError[] = [];
  let stopped = false;
  for (const [index, file] of files.entries()) {
    if (stopped || signal.aborted) {
      errors.push({ index, filename: file.name, code: "not_sent", outcome: "not_sent", message: "Ready" });
      continue;
    }
    if (new TextEncoder().encode(file.name).length > 255 || file.type.length > 1024) {
      errors.push({ index, filename: file.name, code: "unsafe_filename", outcome: "failed", message: "Use a valid filename." });
      continue;
    }
    const formData = new FormData();
    formData.append("files", file);
    try {
      const response = await accountFetch("/api/documents/upload", {
        method: "POST", signal, headers: { "X-Requested-With": "camOS" },
        body: formData, credentials: "include",
      }, 300_000); // A 25 MiB file can take several minutes on a slow link.
      if (!response.ok) {
        if (response.status >= 500) throw new RequestFailure(true);
        errors.push({ index, filename: file.name, code: "too_large", outcome: "failed", message: response.status === 413 ? "File is too large." : "Couldn't upload file. Try again." });
        continue;
      }
      const data = await response.json() as { documents: DocumentItem[]; errors?: UploadError[] };
      const failures = data.errors ?? [];
      if (!Array.isArray(data.documents) || !Array.isArray(failures) || data.documents.length + failures.length !== 1 || data.documents.some(item => item.accountId !== accountId) || failures.some(item => item.index !== 0)) throw new RequestFailure(true);
      if (data.documents.length) {
        documents.push(...data.documents);
        onUploaded(data.documents);
      }
      for (const failure of failures) {
        const unknown = failure.code === "storage_unavailable";
        errors.push({ ...failure, index, outcome: unknown ? "unknown" : "failed", message: unknown ? "Please check before trying again." : ({ unsupported_type: "Accepted types: PDF, CSV, XLSX and DOCX.", too_large: "Each file must be 25 MiB or smaller.", unsafe_filename: "Use a valid filename.", duplicate_filename: "Filename already exists." } as Record<string, string>)[failure.code] ?? "Couldn't upload file. Try again." });
        if (unknown) stopped = true;
      }
    } catch (error) {
      errors.push({ index, filename: file.name, code: "request_unknown", outcome: "unknown", message: "Please check before trying again." });
      stopped = true;
    }
  }
  return { documents, errors };
};

export const deleteDocument = async (documentId: string): Promise<void> => {
  const response = await accountFetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers: { "X-Requested-With": "camOS" },
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status >= 500) throw new RequestFailure(true);
    throw await responseError(response, "Unable to delete document. Refresh and try again.");
  }
};

export const getDownloadUrl = (documentId: string, accountId: string) =>
  `/api/documents/${encodeURIComponent(documentId)}/download?expected_account_id=${encodeURIComponent(accountId)}`;
