import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteDocument as deleteRequest, getDownloadUrl, listDocuments, uploadDocuments } from "../api/documentsApi";
import { DocumentItem, UploadError } from "../types";

export const useDocuments = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setIsLoading(true); setError(null);
    try { setDocuments(await listDocuments()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load documents. Try again."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const uploadBatch = useCallback(async (files: File[]) => {
    setMessage(null);
    const result = await uploadDocuments(files);
    if (result.documents.length) {
      // Confirmed writes remain visible if the catalogue refresh fails.
      setDocuments(prev => Array.from(new Map([...prev, ...result.documents].map(item => [item.id, item])).values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setMessage(`${result.documents.length} document${result.documents.length === 1 ? "" : "s"} uploaded.`);
      await refresh();
    }
    return result;
  }, [refresh]);
  const removeDocument = useCallback(async (id: string) => {
    if (deletingId) return;
    setDeletingId(id); setMessage(null);
    try {
      await deleteRequest(id);
      setDocuments(prev => prev.filter(item => item.id !== id));
      setMessage("Document deleted.");
      await refresh();
    } finally { setDeletingId(null); }
  }, [deletingId, refresh]);
  const downloadDocument = useCallback((item: DocumentItem) => {
    window.open(getDownloadUrl(item.id), "_blank", "noopener,noreferrer");
  }, []);
  return useMemo(() => ({ documents, isLoading, error, message, deletingId, refresh, uploadBatch, removeDocument, downloadDocument }),
    [documents, isLoading, error, message, deletingId, refresh, uploadBatch, removeDocument, downloadDocument]);
};
