"""Documents service-to-storage contract."""

from dataclasses import dataclass
from typing import BinaryIO, Iterable, Protocol


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
