import React from "react";
import { Plus } from "lucide-react";
import { DocumentItem } from "../types";
import DocumentTile from "./DocumentTile";

type DocumentsGridProps = {
  documents: DocumentItem[];
  onUploadClick: () => void;
  onDownload: (documentItem: DocumentItem) => void;
  onDelete: (documentId: string) => void | Promise<void>;
  loading?: boolean;
};

const DocumentsGrid: React.FC<DocumentsGridProps> = ({
  documents,
  onUploadClick,
  onDownload,
  onDelete,
  loading,
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
      {documents.map((documentItem) => (
        <DocumentTile
          key={documentItem.id}
          documentItem={documentItem}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export default DocumentsGrid;
