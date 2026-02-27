"""Documents metadata + blob persistence."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path

from backend.app.config import DOCUMENT_BLOBS_DIR, DOCUMENTS_FILE
from backend.app.models_documents import DocumentRecord


def _ensure_documents_file() -> None:
    file_path = Path(DOCUMENTS_FILE)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if not file_path.exists():
        file_path.write_text("[]", encoding="utf-8")


def _load_all_documents() -> list[dict]:
    _ensure_documents_file()
    with open(DOCUMENTS_FILE, "r", encoding="utf-8") as file:
        raw = json.load(file)
    if isinstance(raw, list):
        return raw
    return []


def _save_all_documents(records: list[dict]) -> None:
    _ensure_documents_file()
    file_dir = os.path.dirname(DOCUMENTS_FILE) or "."
    os.makedirs(file_dir, exist_ok=True)
    temp_fd, temp_path = tempfile.mkstemp(dir=file_dir, suffix=".tmp")
    try:
        with os.fdopen(temp_fd, "w", encoding="utf-8") as temp_file:
            json.dump(records, temp_file, indent=2)
        shutil.move(temp_path, DOCUMENTS_FILE)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


def list_documents(account_id: str) -> list[DocumentRecord]:
    records = [
        DocumentRecord.model_validate(item)
        for item in _load_all_documents()
        if item.get("accountId") == account_id and item.get("status") == "active"
    ]
    return sorted(records, key=lambda item: item.createdAt, reverse=True)


def get_document(account_id: str, document_id: str) -> DocumentRecord | None:
    for item in _load_all_documents():
        if (
            item.get("id") == document_id
            and item.get("accountId") == account_id
            and item.get("status") == "active"
        ):
            return DocumentRecord.model_validate(item)
    return None


def create_document(document: DocumentRecord) -> DocumentRecord:
    records = _load_all_documents()
    records.append(document.model_dump())
    _save_all_documents(records)
    return document


def mark_deleted(account_id: str, document_id: str, updated_at: str) -> bool:
    records = _load_all_documents()
    updated = False
    for item in records:
        if (
            item.get("id") == document_id
            and item.get("accountId") == account_id
            and item.get("status") == "active"
        ):
            item["status"] = "deleted"
            item["updatedAt"] = updated_at
            updated = True
            break
    if updated:
        _save_all_documents(records)
    return updated


def write_blob(document_id: str, payload: bytes) -> Path:
    base_dir = Path(DOCUMENT_BLOBS_DIR)
    base_dir.mkdir(parents=True, exist_ok=True)
    blob_path = base_dir / document_id
    with open(blob_path, "wb") as file:
        file.write(payload)
    return blob_path


def read_blob(document_id: str) -> bytes | None:
    blob_path = Path(DOCUMENT_BLOBS_DIR) / document_id
    if not blob_path.exists():
        return None
    with open(blob_path, "rb") as file:
        return file.read()
