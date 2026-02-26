import React, { useState } from "react";
import DocumentsGrid from "./components/DocumentsGrid";
import UploadDocumentModal from "./components/UploadDocumentModal";
import { useDocuments } from "./hooks/useDocuments";
import "../dashboard/styles/DashboardPage.css";
import "./DocumentsPage.css";

const DocumentsPage: React.FC = () => {
  const { documents, addDocuments, downloadDocument, removeDocument } = useDocuments();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  return (
    <div className="dashboard-v2 documents-page">
      <div className="dashboard-v2__content documents-page__content">
        <header className="dashboard-v2__header documents-page__header">
          <h1 className="documents-page__title">My Documents</h1>
        </header>

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
