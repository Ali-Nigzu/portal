import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteDocument as deleteDocumentRequest,
  getDownloadUrl,
  listDocuments,
  uploadDocuments,
} from "../api/documentsApi";
import { DocumentItem, UploadError } from "../types";

export const useDocuments = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadBatch = useCallback(async (files: File[]) => {
    const result = await uploadDocuments(files);
    setDocuments((prev) => {
      const merged = [...result.documents, ...prev];
      const dedupe = new Map(merged.map((item) => [item.id, item]));
      return Array.from(dedupe.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    });
    return result;
  }, []);

  const removeDocument = useCallback(async (documentId: string) => {
    const previous = documents;
    setDocuments((prev) => prev.filter((item) => item.id !== documentId));
    try {
      await deleteDocumentRequest(documentId);
    } catch (deleteError) {
      setDocuments(previous);
      throw deleteError;
    }
  }, [documents]);

  const downloadDocument = useCallback((documentItem: DocumentItem) => {
    window.open(getDownloadUrl(documentItem.id), "_blank", "noopener,noreferrer");
  }, []);

  return useMemo(
    () => ({
      documents,
      isLoading,
      error,
      refresh,
      uploadBatch,
      removeDocument,
      downloadDocument,
    }),
    [documents, isLoading, error, refresh, uploadBatch, removeDocument, downloadDocument],
  );
};

export type UploadBatchResult = {
  documents: DocumentItem[];
  errors: UploadError[];
};
