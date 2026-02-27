"""Documents business logic."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import UploadFile

from backend.app.data.documents_store import (
    create_document,
    get_document,
    list_documents,
    mark_deleted,
    read_blob,
    write_blob,
)
from backend.app.models_documents import DocumentRecord, infer_type, new_doc_id, now_iso

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_TYPES = {"pdf", "csv", "xlsx", "docx"}


@dataclass
class UploadError:
    filename: str
    code: str
    message: str


@dataclass
class UploadBatchResult:
    documents: list[DocumentRecord]
    errors: list[UploadError]


class DocumentsService:
    def list(self, account_id: str) -> list[DocumentRecord]:
        return list_documents(account_id)

    async def upload_batch(self, account_id: str, files: list[UploadFile]) -> UploadBatchResult:
        created: list[DocumentRecord] = []
        errors: list[UploadError] = []

        for upload in files:
            filename = upload.filename or "unnamed"
            payload = await upload.read()
            inferred_type = infer_type(upload.content_type or "", filename)

            if inferred_type.value not in ALLOWED_TYPES:
                errors.append(
                    UploadError(
                        filename=filename,
                        code="unsupported_type",
                        message="Unsupported file type.",
                    ),
                )
                continue

            if len(payload) > MAX_UPLOAD_BYTES:
                errors.append(
                    UploadError(
                        filename=filename,
                        code="too_large",
                        message="File exceeds maximum size of 25MB.",
                    ),
                )
                continue

            now = now_iso()
            document = DocumentRecord(
                id=new_doc_id(),
                accountId=account_id,
                name=filename,
                type=inferred_type,
                mimeType=upload.content_type or "application/octet-stream",
                sizeBytes=len(payload),
                createdAt=now,
                updatedAt=now,
                status="active",
            )

            try:
                create_document(document)
                write_blob(document.id, payload)
                created.append(document)
            except Exception:
                errors.append(
                    UploadError(
                        filename=filename,
                        code="internal",
                        message="Failed to persist file.",
                    ),
                )

        created.sort(key=lambda item: item.createdAt, reverse=True)
        return UploadBatchResult(documents=created, errors=errors)

    def download(self, account_id: str, document_id: str) -> tuple[DocumentRecord | None, bytes | None]:
        document = get_document(account_id, document_id)
        if not document:
            return None, None
        payload = read_blob(document_id)
        return document, payload

    def delete(self, account_id: str, document_id: str) -> bool:
        return mark_deleted(account_id, document_id, now_iso())


documents_service = DocumentsService()
