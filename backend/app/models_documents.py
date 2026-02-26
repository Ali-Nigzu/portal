"""Documents domain models and helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel


class DocumentType(str, Enum):
    PDF = "pdf"
    CSV = "csv"
    XLSX = "xlsx"
    DOCX = "docx"
    OTHER = "other"


class DocumentRecord(BaseModel):
    id: str
    accountId: str
    name: str
    type: DocumentType
    mimeType: str
    sizeBytes: int
    createdAt: str
    updatedAt: str
    status: str = "active"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_doc_id() -> str:
    return str(uuid4())


def infer_type(mime_type: str, filename: str) -> DocumentType:
    normalized_mime = (mime_type or "").lower()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if normalized_mime == "application/pdf" or extension == "pdf":
        return DocumentType.PDF
    if normalized_mime == "text/csv" or extension == "csv":
        return DocumentType.CSV
    if (
        normalized_mime
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        or extension == "xlsx"
    ):
        return DocumentType.XLSX
    if (
        normalized_mime
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or extension == "docx"
    ):
        return DocumentType.DOCX
    return DocumentType.OTHER
