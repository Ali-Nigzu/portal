import React, { useEffect, useMemo, useRef, useState } from "react";
import { UploadError, ACCEPTED_EXTENSIONS, PendingUploadItem } from "../types";

import { createPortal } from "react-dom";
import { Loader2, Trash2, Upload, X } from "lucide-react";

type UploadDocumentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[], signal: AbortSignal) => Promise<{ errors: UploadError[] }>;
};

const ACCEPTED_FILES = ACCEPTED_EXTENSIONS.join(",");

const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  onUpload,
}) => {
  const operation = useRef<AbortController | null>(null);
  const close = () => { operation.current?.abort(); onClose(); };
  useEffect(() => () => operation.current?.abort(), []);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingUploadItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const uploadingRef = useRef(isUploading);
  const closeRef = useRef(onClose);
  uploadingRef.current = isUploading;
  closeRef.current = close;

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
        closeRef.current();
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
          'button:not([disabled]), input:not([disabled]):not([type="file"]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
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
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialogRef.current),
    );
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const addPendingFiles = (files: File[]) => {
    const seen = new Set(pendingFiles.map(item => item.file.name));
    const next: PendingUploadItem[] = [];
    let validationError: string | null = null;
    for (const file of files) {
      if (seen.has(file.name)) { validationError = "Each staged file must have a different filename."; continue; }
      if (!ACCEPTED_EXTENSIONS.some(extension => file.name.toLowerCase().endsWith(extension))) {
        validationError = "Accepted types: PDF, CSV, XLSX and DOCX."; continue;
      }
      if (file.size > 25 * 1024 * 1024) { validationError = "Each file must be 25 MiB or smaller."; continue; }
      seen.add(file.name);
      next.push({ localId: crypto.randomUUID(), file, status: "ready" });
    }
    setPendingFiles(prev => [...prev, ...next]);
    setErrorMessage(validationError);
  };

  const submitUpload = async () => {
    if (operation.current) return;
    const selected = pendingFiles.filter(item => item.status !== "unknown");
    if (!selected.length) return;
    const controller = new AbortController();
    operation.current = controller;
    const selectedIds = new Set(selected.map(item => item.localId));
    setIsUploading(true);
    setPendingFiles(previous => previous.map(item => selectedIds.has(item.localId) ? { ...item, status: "uploading", error: undefined } : item));
    setErrorMessage(null);
    try {
      const result = await onUpload(selected.map(item => item.file), controller.signal);
      if (controller.signal.aborted) return;
      if (!result.errors.length && selected.length === pendingFiles.length) { onClose(); return; }
      const errors = new Map(result.errors.map(error => [selected[error.index]?.localId, error]));
      setPendingFiles(previous => previous.flatMap(item => {
        if (!selectedIds.has(item.localId)) return [item];
        const error = errors.get(item.localId);
        return error ? [{ ...item, status: error.outcome === "unknown" ? "unknown" as const : error.outcome === "not_sent" ? "ready" as const : "failed" as const, error: error.message }] : [];
      }));
      setErrorMessage("Some files need attention.");
    } catch {
      if (!controller.signal.aborted) {
        setPendingFiles(previous => previous.map(item => selectedIds.has(item.localId) ? { ...item, status: "unknown", error: "Please check before trying again." } : item));
        setErrorMessage("Please check before trying again.");
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setIsUploading(false);
    }
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="documents-page__modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="documents-upload-title"
      onMouseDown={(event) => {
        if (event.target === overlayRef.current) {
          close();
        }
      }}
    >
      <div ref={dialogRef} tabIndex={-1} className="documents-page__modal">
        <div className="documents-page__modal-header">
          <h2 id="documents-upload-title">Upload documents</h2>
          <button
            type="button"
            className="documents-page__icon-button"
            onClick={close}
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
            tabIndex={-1}
            disabled={isUploading}
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
            <small>PDF, CSV, XLSX, DOCX · maximum 25 MiB per file</small>
          </button>

          <ul className="documents-page__staged-list" aria-live="polite">
            {pendingFiles.map((item) => (
              <li key={item.localId} className="documents-page__staged-row">
                <div className="documents-page__staged-meta">
                  <strong>{item.file.name}</strong>
                  <small>
                    {item.status === "uploading"
                      ? "Uploading..."
                      : item.status === "failed" || item.status === "unknown"
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
          {errorMessage && <p role="alert" className="documents-page__error">{errorMessage}</p>}
        </div>

        <div className="documents-page__modal-actions">
          <button
            type="button"
            className="documents-page__button documents-page__button--ghost"
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className="vrm-btn vrm-btn-primary"
            onClick={submitUpload}
            disabled={!pendingFiles.some(item => item.status !== "unknown") || isUploading}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default UploadDocumentModal;
