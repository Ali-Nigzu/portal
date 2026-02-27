import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, Upload, X } from "lucide-react";
import { ACCEPTED_EXTENSIONS, PendingUploadItem, UploadError } from "../types";

type UploadDocumentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => Promise<{ errors: UploadError[] }>;
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
  const [pendingFiles, setPendingFiles] = useState<PendingUploadItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mode = useMemo(() => {
    if (isUploading) {
      return "UPLOADING";
    }
    return pendingFiles.length > 0 ? "OPEN_STAGED" : "OPEN_EMPTY";
  }, [isUploading, pendingFiles.length]);

  useEffect(() => {
    if (!isOpen) {
      setPendingFiles([]);
      setErrorMessage(null);
      setIsUploading(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isUploading) {
          onClose();
        }
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
  }, [isOpen, isUploading, onClose]);

  if (!isOpen) {
    return null;
  }

  const addPendingFiles = (files: File[]) => {
    const next: PendingUploadItem[] = files.map((file) => ({
      localId: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      status: "ready",
    }));

    setPendingFiles((prev) => [...prev, ...next]);
    setErrorMessage(null);
  };

  const submitUpload = async () => {
    if (pendingFiles.length === 0) {
      setErrorMessage("Select at least one file to upload.");
      return;
    }

    setIsUploading(true);
    setPendingFiles((prev) => prev.map((item) => ({ ...item, status: "uploading", error: undefined })));
    setErrorMessage(null);

    try {
      const uploadResult = await onUpload(pendingFiles.map((item) => item.file));

      if (uploadResult.errors.length === 0) {
        onClose();
        return;
      }

      const errorMap = new Map(uploadResult.errors.map((entry) => [entry.filename, entry.message]));
      setPendingFiles((prev) => {
        const failed = prev
          .map((item) => {
            const message = errorMap.get(item.file.name);
            if (!message) {
              return null;
            }
            return {
              ...item,
              status: "failed" as const,
              error: message,
            };
          })
          .filter((item): item is PendingUploadItem => item !== null);
        return failed;
      });
      setErrorMessage("Some files failed. Remove or retry failed files.");
    } catch (uploadError) {
      setPendingFiles((prev) => prev.map((item) => ({
        ...item,
        status: "failed",
        error: "Upload failed.",
      })));
      setErrorMessage(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="documents-page__modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="documents-upload-title"
      onMouseDown={(event) => {
        if (event.target === overlayRef.current && !isUploading) {
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
            disabled={isUploading}
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
              addPendingFiles(files);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="documents-page__dropzone"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload size={22} aria-hidden="true" />
            <span>Add files</span>
            <small>Accepted types: PDF, CSV, XLSX, DOCX</small>
          </button>

          <ul className="documents-page__staged-list" aria-live="polite">
            {pendingFiles.map((item) => (
              <li key={item.localId} className="documents-page__staged-row">
                <div className="documents-page__staged-meta">
                  <strong>{item.file.name}</strong>
                  <small>
                    {item.status === "uploading"
                      ? "Uploading..."
                      : item.status === "failed"
                        ? item.error ?? "Failed"
                        : "Ready"}
                  </small>
                </div>
                <button
                  type="button"
                  className="documents-page__icon-button documents-page__icon-button--danger"
                  onClick={() => {
                    setPendingFiles((prev) => prev.filter((entry) => entry.localId !== item.localId));
                  }}
                  aria-label={`Remove ${item.file.name} from upload list`}
                  disabled={isUploading}
                >
                  {item.status === "uploading" ? <Loader2 size={16} className="documents-page__spinner" /> : <Trash2 size={16} />}
                </button>
              </li>
            ))}
          </ul>

          <p className="documents-page__selection-label">
            {mode === "OPEN_EMPTY" ? "No files staged" : `${pendingFiles.length} file(s) staged`}
          </p>
          {errorMessage && <p className="documents-page__error">{errorMessage}</p>}
        </div>

        <div className="documents-page__modal-actions">
          <button
            type="button"
            className="documents-page__button documents-page__button--ghost"
            onClick={onClose}
            disabled={isUploading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="documents-page__button"
            onClick={submitUpload}
            disabled={pendingFiles.length === 0 || isUploading}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadDocumentModal;
