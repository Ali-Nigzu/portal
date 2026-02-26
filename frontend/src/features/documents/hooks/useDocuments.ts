import { useMemo, useState } from "react";
import { ACCEPTED_DOCUMENT_TYPES, DocumentItem, DocumentsState } from "../types";

const ACCEPTED_TYPE_SET = new Set<string>(ACCEPTED_DOCUMENT_TYPES);

const isAcceptedFileType = (file: File) => {
  if (file.type && ACCEPTED_TYPE_SET.has(file.type)) {
    return true;
  }
  return /\.(pdf|csv|xlsx|docx)$/i.test(file.name);
};

const createDocumentItem = (file: File): DocumentItem => ({
  id: typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: file.name,
  mimeType: file.type || "application/octet-stream",
  sizeBytes: file.size,
  createdAt: Date.now(),
  source: "local",
  file,
});

export const useDocuments = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const state: DocumentsState = documents.length > 0 ? "HAS_DOCS" : "EMPTY";

  const addDocuments = (files: File[]) => {
    const validFiles = files.filter(isAcceptedFileType);
    const invalidFiles = files.filter((file) => !isAcceptedFileType(file));

    if (validFiles.length > 0) {
      setDocuments((prev) => [...createDocumentItems(validFiles), ...prev]);
    }

    return {
      added: validFiles.length,
      invalid: invalidFiles,
    };
  };

  const removeDocument = (documentId: string) => {
    setDocuments((prev) => prev.filter((item) => item.id !== documentId));
  };

  const downloadDocument = (documentItem: DocumentItem) => {
    const objectUrl = URL.createObjectURL(documentItem.file);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = documentItem.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  return useMemo(
    () => ({
      state,
      documents,
      addDocuments,
      removeDocument,
      downloadDocument,
    }),
    [documents, state],
  );
};

const createDocumentItems = (files: File[]) => files.map(createDocumentItem);
