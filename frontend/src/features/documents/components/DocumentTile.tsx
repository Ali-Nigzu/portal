import React from "react";
import { Download, FileSpreadsheet, FileText, FileType2, Trash2 } from "lucide-react";
import { DocumentItem } from "../types";

type DocumentTileProps = {
  documentItem: DocumentItem;
  onDownload: (documentItem: DocumentItem) => void;
  onDelete: (documentId: string) => void | Promise<void>;
  deleting?: boolean;
  deleteDisabled?: boolean;
};

const getFileIcon = (type: DocumentItem["type"]) => {
  if (type === "csv" || type === "xlsx") {
    return <FileSpreadsheet size={18} aria-hidden="true" />;
  }
  if (type === "docx") {
    return <FileType2 size={18} aria-hidden="true" />;
  }
  return <FileText size={18} aria-hidden="true" />;
};

const DocumentTile: React.FC<DocumentTileProps> = ({
  documentItem,
  onDownload,
  onDelete,
  deleting,
  deleteDisabled,
}) => {
  const fileTypeLabel = documentItem.type.toUpperCase();

  return (
    <article className="documents-page__tile documents-page__tile--file">
      <header className="documents-page__tile-header">
        <span className="documents-page__type-badge">
          {getFileIcon(documentItem.type)}
          {fileTypeLabel}
        </span>
      </header>

      <div className="documents-page__tile-body">
        <div className="documents-page__tile-actions">
          <button
            type="button"
            className="documents-page__icon-button"
            onClick={() => onDownload(documentItem)}
            aria-label={`Download ${documentItem.name}`}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="documents-page__icon-button documents-page__icon-button--danger"
            onClick={() => onDelete(documentItem.id)}
            disabled={deleteDisabled}
            aria-label={`Delete ${documentItem.name}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {deleting && <span role="status">Deleting…</span>}

        <h3 title={documentItem.name} className="documents-page__file-name">
          {documentItem.name}
        </h3>
        <p className="documents-page__file-meta">
          {documentItem.sizeBytes < 1024 ? `${documentItem.sizeBytes} B` : documentItem.sizeBytes < 1024 * 1024
            ? `${(documentItem.sizeBytes / 1024).toFixed(1)} KiB` : `${(documentItem.sizeBytes / (1024 * 1024)).toFixed(1)} MiB`}
          {" · "}<time dateTime={documentItem.createdAt}>{new Date(documentItem.createdAt).toLocaleDateString()}</time>
        </p>
      </div>
    </article>
  );
};

export default DocumentTile;
