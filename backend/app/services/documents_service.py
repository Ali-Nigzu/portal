"""Canonical-user Documents policy, backed by one selected object adapter."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool

from backend.app.data.documents_store import CHUNK_SIZE, DocumentsStore
from backend.app.models_documents import (
    DocumentError, DocumentRecord, MIME_TYPES, document_id, filename_from_id,
    infer_type, safe_filename,
)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@dataclass
class UploadError:
    filename: str
    code: str
    message: str
    index: int


@dataclass
class UploadBatchResult:
    documents: list[DocumentRecord]
    errors: list[UploadError]


class DocumentsService:
    def __init__(self, store: DocumentsStore):
        self.store = store

    @staticmethod
    def prefix(user_id):
        # This value comes from CanonicalUser.id, never a request field.
        if not isinstance(user_id, int) or isinstance(user_id, bool) or user_id < 0:
            raise ValueError('Canonical user ID required')
        return f'{user_id}/'

    def record(self, user_id, item):
        prefix = self.prefix(user_id)
        if not item.name.startswith(prefix):
            raise ValueError('Unexpected object prefix')
        name = safe_filename(item.name[len(prefix):])
        kind = infer_type('', name)
        return DocumentRecord(id=document_id(name), accountId=str(user_id), name=name,
            type=kind, mimeType=MIME_TYPES.get(kind.value, 'application/octet-stream'),
            sizeBytes=item.size, createdAt=item.created_at, updatedAt=item.updated_at)

    def list(self, user_id):
        records = []
        for item in self.store.list(self.prefix(user_id)):
            try:
                records.append(self.record(user_id, item))
            except (DocumentError, ValueError):
                # Ignore nested objects, markers and unsafe administrative names.
                continue
        return sorted(records, key=lambda item: (item.createdAt, item.name), reverse=True)

    async def upload_batch(self, user_id, files: list[UploadFile]):
        created, errors = [], []
        try:
            for index, upload in enumerate(files):
                filename = upload.filename or ''
                try:
                    name = safe_filename(filename)
                    kind = infer_type('', name)
                    if kind.value not in MIME_TYPES:
                        raise DocumentError(422, 'unsupported_type', 'Accepted types: PDF, CSV, XLSX and DOCX.')
                    # Validate the existing request spool before any storage write.
                    # Reading stops at the limit; only one bounded chunk is in memory.
                    size = 0
                    while True:
                        chunk = await upload.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > MAX_UPLOAD_BYTES:
                            raise DocumentError(422, 'too_large', 'File exceeds maximum size of 25 MiB.')
                    await upload.seek(0)
                    item = await run_in_threadpool(self.store.create, self.prefix(user_id) + name,
                                                   upload.file, MIME_TYPES[kind.value])
                    created.append(self.record(user_id, item))
                except DocumentError as error:
                    errors.append(UploadError(filename, error.code, error.message, index))
            return UploadBatchResult(sorted(created, key=lambda item: item.createdAt, reverse=True), errors)
        finally:
            for upload in files:
                await upload.close()

    def download(self, user_id, value):
        name = self.prefix(user_id) + filename_from_id(value)
        item = self.store.get(name)
        reader = self.store.open(name, item.generation)
        try:
            # Preflight the first read before returning HTTP 200.
            first = reader.read(CHUNK_SIZE)
            return self.record(user_id, item), reader, first
        except Exception:
            reader.close()
            raise

    @staticmethod
    def chunks(reader, first):
        try:
            if first:
                yield first
            while True:
                chunk = reader.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
        finally:
            reader.close()

    def delete(self, user_id, value):
        name = self.prefix(user_id) + filename_from_id(value)
        item = self.store.get(name)
        self.store.delete(name, item.generation)
