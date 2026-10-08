"""Small Documents adapter contract and explicit, ephemeral offline fixture.

Production uses GCS; this module contains no local metadata or blob persistence.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from threading import RLock
from typing import BinaryIO, Iterable, Protocol

from backend.app.models_documents import DocumentError

CHUNK_SIZE = 256 * 1024


@dataclass(frozen=True)
class StoredDocument:
    name: str
    size: int
    created_at: str
    updated_at: str
    generation: int


class DocumentsStore(Protocol):
    def list(self, prefix: str) -> Iterable[StoredDocument]: ...
    def create(self, name: str, source: BinaryIO, mime_type: str) -> StoredDocument: ...
    def get(self, name: str) -> StoredDocument: ...
    def open(self, name: str, generation: int) -> BinaryIO: ...
    def delete(self, name: str, generation: int) -> None: ...


class MemoryDocumentsStore:
    """Only selected for the non-production local fixture or injected by tests."""

    def __init__(self):
        self._objects = {}
        self._generation = 0
        self._lock = RLock()

    def list(self, prefix):
        with self._lock:
            return [record for record, _ in self._objects.values() if record.name.startswith(prefix)]

    def create(self, name, source, mime_type):
        with self._lock:
            if name in self._objects:
                raise DocumentError(409, 'duplicate_filename', 'A document with this filename already exists. Rename the file and try again.')
            content = source.read()
            self._generation += 1
            now = datetime.now(timezone.utc).isoformat()
            record = StoredDocument(name, len(content), now, now, self._generation)
            self._objects[name] = (record, content)
            return record

    def get(self, name):
        with self._lock:
            if name not in self._objects:
                raise DocumentError(404, 'not_found', 'Document not found.')
            return self._objects[name][0]

    def open(self, name, generation):
        with self._lock:
            record = self.get(name)
            if record.generation != generation:
                raise DocumentError(409, 'document_changed', 'Document changed. Refresh and try again.')
            return BytesIO(self._objects[name][1])

    def delete(self, name, generation):
        with self._lock:
            if self.get(name).generation != generation:
                raise DocumentError(409, 'document_changed', 'Document changed. Refresh and try again.')
            del self._objects[name]
