"""Ephemeral Documents fixture for isolated tests and development."""

from datetime import datetime, timezone
from io import BytesIO
from threading import RLock
from backend.app.models_documents import DocumentError
from backend.app.data.documents_store import StoredDocument

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
