import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { ACCEPTED_EXTENSIONS } from "../types";

type UploadDocumentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => { added: number; invalid: File[] };
};

const ACCEPTED_FILES = ACCEPTED_EXTENSIONS.join(",");

const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  onUpload,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCountLabel = useMemo(() => {
    if (selectedFiles.length === 0) {
      return "No files selected";
    }
    if (selectedFiles.length === 1) {
      return selectedFiles[0].name;
    }
    return `${selectedFiles.length} files selected`;
  }, [selectedFiles]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFiles([]);
      setErrorMessage(null);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const container = dialogRef.current;
      if (!container) {
        return;
      }

      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fileInputRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const submitUpload = () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("Select at least one file to upload.");
      return;
    }

    const uploadResult = onUpload(selectedFiles);
    if (uploadResult.invalid.length > 0) {
      const invalidNames = uploadResult.invalid.map((file) => file.name).join(", ");
      setErrorMessage(`Unsupported file type: ${invalidNames}`);
      return;
    }

    onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="documents-page__modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="documents-upload-title"
      onMouseDown={(event) => {
        if (event.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div ref={dialogRef} className="documents-page__modal">
        <div className="documents-page__modal-header">
          <h2 id="documents-upload-title">Upload documents</h2>
          <button
            type="button"
            className="documents-page__icon-button"
            onClick={onClose}
            aria-label="Close upload modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="documents-page__upload-panel">
          <input
            ref={fileInputRef}
            className="documents-page__file-input"
            type="file"
            accept={ACCEPTED_FILES}
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              setSelectedFiles(files);
              setErrorMessage(null);
            }}
          />
          <button
            type="button"
            className="documents-page__dropzone"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={22} aria-hidden="true" />
            <span>Choose files</span>
            <small>Accepted types: PDF, CSV, XLSX, DOCX</small>
          </button>
          <p className="documents-page__selection-label">{selectedCountLabel}</p>
          {errorMessage && <p className="documents-page__error">{errorMessage}</p>}
        </div>

        <div className="documents-page__modal-actions">
          <button type="button" className="documents-page__button documents-page__button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="documents-page__button" onClick={submitUpload}>
            Upload
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadDocumentModal;
