import React, { useState } from "react";
import DocumentsGrid from "./components/DocumentsGrid";
import UploadDocumentModal from "./components/UploadDocumentModal";
import { useDocuments } from "./hooks/useDocuments";
import "../dashboard/styles/DashboardPage.css";
import "./DocumentsPage.css";

const DocumentsPage: React.FC = () => {
  const { state, documents, addDocuments, downloadDocument, removeDocument } = useDocuments();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  return (
    <div className="dashboard-v2 documents-page">
      <div className="dashboard-v2__content documents-page__content">
        <header className="dashboard-v2__header documents-page__header">
          <div>
            <h1 className="documents-page__title">My Documents</h1>
            <p className="documents-page__subtitle">
              Upload PDFs, CSVs, Excel, or Word files to keep quick references in one place.
            </p>
          </div>
          <button
            type="button"
            className="documents-page__button"
            onClick={() => setIsUploadModalOpen(true)}
          >
            Upload
          </button>
        </header>

        {state === "EMPTY" && (
          <p className="documents-page__empty-copy">
            No documents yet. Start by uploading your first file.
          </p>
        )}

        <DocumentsGrid
          documents={documents}
          onUploadClick={() => setIsUploadModalOpen(true)}
          onDownload={downloadDocument}
          onDelete={removeDocument}
        />
      </div>

      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={addDocuments}
      />
    </div>
  );
};

export default DocumentsPage;
