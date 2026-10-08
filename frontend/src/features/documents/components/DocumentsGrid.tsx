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
          <p>Documents shared with you will appear here. You can also upload your own.</p>
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

export default DocumentsGrid;
