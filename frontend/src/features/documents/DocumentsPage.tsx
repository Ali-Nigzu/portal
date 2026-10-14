import { useAuthenticatedApplication } from "../../context/AuthenticatedApplicationContext";
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";

import UploadDocumentModal from "./components/UploadDocumentModal";
import "../../styles/Dashboard.css";
import "./DocumentsPage.css";
import { Plus } from "lucide-react";
import { DocumentItem } from "./types";
import DocumentTile from "./components/DocumentTile";
import {
  deleteDocument as deleteRequest,
  getDownloadUrl,
  listDocuments,
  uploadDocuments,
} from "./api/documentsApi";

const DocumentsPage: React.FC = () => {
  const {
    documents,
    isLoading,
    error,
    message,
    deletingId,
    refresh,
    uploadBatch,
    downloadDocument,
    removeDocument,
  } = useDocuments();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <div className="dashboard-v2 documents-page">
      <div className="dashboard-v2__content documents-page__content">
        <header className="dashboard-v2__header documents-page__header">
          <h1 className="documents-page__title">My Documents</h1>
          <button
            type="button"
            className="vrm-btn vrm-btn-secondary"
            disabled={isLoading || Boolean(deletingId)}
            onClick={() => void refresh()}
          >
            {isLoading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        {error && (
          <div className="documents-page__banner" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="documents-page__button documents-page__button--ghost"
              onClick={refresh}
            >
              Retry
            </button>
          </div>
        )}

        {deleteError && (
          <div
            className="documents-page__banner documents-page__banner--danger"
            role="alert"
          >
            <span>{deleteError}</span>
          </div>
        )}

        {message && (
          <p className="documents-page__success" role="status">
            {message}
          </p>
        )}

        <DocumentsGrid
          documents={documents}
          onUploadClick={() => setIsUploadModalOpen(true)}
          onDownload={downloadDocument}
          onDelete={async (documentId) => {
            setDeleteError(null);
            try {
              await removeDocument(documentId);
            } catch (removeError) {
              setDeleteError(
                removeError instanceof Error
                  ? removeError.message
                  : "Failed to delete document",
              );
            }
          }}
          loading={isLoading}
          failed={Boolean(error)}
          deletingId={deletingId}
        />
      </div>

      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={uploadBatch}
      />
    </div>
  );
};

export default DocumentsPage;

type DocumentsGridProps = {
  documents: DocumentItem[];
  onUploadClick: () => void;
  onDownload: (documentItem: DocumentItem) => void;
  onDelete: (documentId: string) => void | Promise<void>;
  loading?: boolean;
  failed?: boolean;
  deletingId?: string | null;
};

const DocumentsGrid: React.FC<DocumentsGridProps> = ({
  documents,
  onUploadClick,
  onDownload,
  onDelete,
  loading,
  failed,
  deletingId,
}) => {
  return (
    <div className="documents-page__grid" aria-live="polite">
      <button
        type="button"
        className="documents-page__tile documents-page__tile--upload"
        onClick={onUploadClick}
        aria-label="Upload document"
      >
        <Plus size={28} aria-hidden="true" />
        <span>Upload</span>
      </button>
      {loading && documents.length === 0 && (
        <article className="documents-page__tile documents-page__tile--loading">
          <span>Loading documents...</span>
        </article>
      )}
      {!loading && !failed && documents.length === 0 && (
        <article className="documents-page__tile documents-page__tile--empty">
          <h2>No documents yet</h2>
          <p>
            Documents shared with you will appear here. You can also upload your
            own.
          </p>
        </article>
      )}
      {documents.map((documentItem) => (
        <DocumentTile
          key={documentItem.id}
          documentItem={documentItem}
          onDownload={onDownload}
          onDelete={onDelete}
          deleting={deletingId === documentItem.id}
          deleteDisabled={Boolean(deletingId)}
        />
      ))}
    </div>
  );
};

const useDocuments = () => {
  const { user, accountSignal } = useAuthenticatedApplication();
  const uploadController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const mounted = useRef(true);
  const invalidate = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
  }, []);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    invalidate();
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setIsLoading(true);
    setError(null);
    try {
      const documents = await listDocuments(abort.signal, user.id);
      if (mounted.current && current === generation.current) setDocuments(documents);
    } catch (failure) {
      if (!mounted.current || abort.signal.aborted || current !== generation.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load documents. Try again.",
      );
    } finally {
      if (mounted.current && current === generation.current) setIsLoading(false);
    }
  }, [invalidate, user.id]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; invalidate(); uploadController.current?.abort(); };
  }, [refresh, invalidate]);
  const uploadBatch = useCallback(async (files: File[], signal: AbortSignal) => {
    if (uploadController.current) throw new Error("Please try again.");
    const abort = new AbortController();
    uploadController.current = abort;
    const cancel = () => abort.abort();
    for (const source of [signal, accountSignal]) {
      source?.addEventListener("abort", cancel, { once: true });
      if (source?.aborted) cancel();
    }
    setMessage(null);
    try {
      const result = await uploadDocuments(files, user.id, abort.signal, uploaded => {
        if (!mounted.current || accountSignal?.aborted) return;
        invalidate();
        setDocuments(previous => Array.from(new Map([...previous, ...uploaded].map(item => [item.id, item])).values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      });
      if (mounted.current && !accountSignal?.aborted) {
        setMessage(result.errors.some(error => error.outcome === "unknown") ? "Please check before trying again." : result.documents.length ? `${result.documents.length} document${result.documents.length === 1 ? "" : "s"} uploaded.` : null);
        void refresh();
      }
      return result;
    } finally {
      for (const source of [signal, accountSignal]) source?.removeEventListener("abort", cancel);
      if (uploadController.current === abort) uploadController.current = null;
    }
  }, [user.id, accountSignal, refresh, invalidate]);
  const removeDocument = useCallback(
    async (id: string) => {
      if (deletingId) return;
      setDeletingId(id);
      setMessage(null);
      try {
        await deleteRequest(id);
        if (!mounted.current) return;
        invalidate();
        setDocuments((prev) => prev.filter((item) => item.id !== id));
        setMessage("Document deleted.");
        await refresh();
      } finally {
        if (mounted.current) setDeletingId(null);
      }
    },
    [deletingId, refresh, invalidate],
  );
  const downloadDocument = useCallback((item: DocumentItem) => {
    window.open(getDownloadUrl(item.id, item.accountId), "_blank", "noopener,noreferrer");
  }, []);
  return useMemo(
    () => ({
      documents,
      isLoading,
      error,
      message,
      deletingId,
      refresh,
      uploadBatch,
      removeDocument,
      downloadDocument,
    }),
    [
      documents,
      isLoading,
      error,
      message,
      deletingId,
      refresh,
      uploadBatch,
      removeDocument,
      downloadDocument,
    ],
  );
};
