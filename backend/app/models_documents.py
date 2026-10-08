"""Document representations and safe, user-relative object identifiers."""

import base64
import binascii
import re
import unicodedata
from enum import Enum

from pydantic import BaseModel


class DocumentError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class DocumentType(str, Enum):
    PDF = "pdf"
    CSV = "csv"
    XLSX = "xlsx"
    DOCX = "docx"
    OTHER = "other"


MIME_TYPES = {
    "pdf": "application/pdf",
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


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


def safe_filename(value: str) -> str:
    # Do not strip paths: silently turning another path into a basename obscures
    # errors and can collide with an existing administrative document.
    if (not value or not value.strip() or value in {".", ".."}
            or any(char in value for char in '/\\:')
            or any(unicodedata.category(char).startswith('C') for char in value)
            or len(value.encode('utf-8')) > 255):
        raise DocumentError(422, 'unsafe_filename', 'Use a filename without paths or control characters (maximum 255 UTF-8 bytes).')
    return value


def infer_type(mime_type: str, filename: str) -> DocumentType:
    # The MIME supplied by a browser is not an authority for allowed uploads.
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return DocumentType(extension) if extension in MIME_TYPES else DocumentType.OTHER


def document_id(filename: str) -> str:
    return base64.urlsafe_b64encode(safe_filename(filename).encode('utf-8')).decode('ascii').rstrip('=')


def filename_from_id(value: str) -> str:
    try:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,340}', value):
            raise ValueError
        filename = base64.b64decode(value + '=' * (-len(value) % 4), altchars=b'-_', validate=True).decode('utf-8')
        if document_id(filename) != value:
            raise ValueError
        return filename
    except (ValueError, UnicodeError, binascii.Error, DocumentError):
        raise DocumentError(404, 'not_found', 'Document not found.') from None
