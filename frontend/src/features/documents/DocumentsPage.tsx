import React, { useState } from "react";
import DocumentsGrid from "./components/DocumentsGrid";
import UploadDocumentModal from "./components/UploadDocumentModal";
import { useDocuments } from "./hooks/useDocuments";
import "../dashboard/styles/DashboardPage.css";
import "./DocumentsPage.css";

const DocumentsPage: React.FC = () => {
  const {
    documents,
    isLoading,
    error,
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
        </header>

        {error && (
          <div className="documents-page__banner">
            <span>{error}</span>
            <button type="button" className="documents-page__button documents-page__button--ghost" onClick={refresh}>
              Retry
            </button>
          </div>
        )}

        {deleteError && (
          <div className="documents-page__banner documents-page__banner--danger">
            <span>{deleteError}</span>
          </div>
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
              setDeleteError(removeError instanceof Error ? removeError.message : "Failed to delete document");
            }
          }}
          loading={isLoading}
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
