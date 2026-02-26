import React from "react";
import { Plus } from "lucide-react";
import { DocumentItem } from "../types";
import DocumentTile from "./DocumentTile";

type DocumentsGridProps = {
  documents: DocumentItem[];
  onUploadClick: () => void;
  onDownload: (documentItem: DocumentItem) => void;
  onDelete: (documentId: string) => void;
};

const DocumentsGrid: React.FC<DocumentsGridProps> = ({
  documents,
  onUploadClick,
  onDownload,
  onDelete,
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
