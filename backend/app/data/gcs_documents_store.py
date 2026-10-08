"""Private GCS object access. No bucket provisioning or local fallback."""

import logging
from contextlib import contextmanager
from threading import Lock

from google.api_core import exceptions
from google.auth.exceptions import GoogleAuthError
from google.cloud import storage
from google.cloud.storage.retry import DEFAULT_RETRY
from google.cloud.storage.exceptions import DataCorruption

from backend.app.data.documents_store import CHUNK_SIZE, StoredDocument
from backend.app.models_documents import DocumentError

logger = logging.getLogger(__name__)
TIMEOUT = 15
RETRY = DEFAULT_RETRY.with_timeout(30)


@contextmanager
def storage_errors(*, creating=False, missing_object=False):
    try:
        yield
    except exceptions.NotFound:
        if missing_object:
            raise DocumentError(404, 'not_found', 'Document not found.') from None
        logger.warning('documents.storage_unavailable')
        raise DocumentError(503, 'storage_unavailable', 'Documents are temporarily unavailable. Please try again.') from None
    except exceptions.PreconditionFailed:
        raise DocumentError(409, 'duplicate_filename' if creating else 'document_changed',
            'A document with this filename already exists. Rename the file and try again.' if creating
            else 'Document changed. Refresh and try again.') from None
    except (exceptions.GoogleAPIError, GoogleAuthError, DataCorruption, OSError, ValueError):
        # Provider errors may contain paths/credential details; never log text.
        logger.warning('documents.storage_unavailable')
        raise DocumentError(503, 'storage_unavailable', 'Documents are temporarily unavailable. Please try again.') from None


class GcsReader:
    """Translate lazy read errors at the storage boundary, not in policy code."""
    def __init__(self, reader):
        self.reader = reader

    def read(self, size):
        with storage_errors(missing_object=True):
            return self.reader.read(size)

    def close(self):
        self.reader.close()

    @property
    def closed(self):
        return self.reader.closed


class GcsDocumentsStore:
    def __init__(self, bucket_name, client=None):
        self.bucket_name = bucket_name
        self._client = client
        self._lock = Lock()

    def _bucket(self):
        with self._lock:
            if self._client is None:
                self._client = storage.Client(project='camosbase')
            return self._client.bucket(self.bucket_name)

    @staticmethod
    def _record(blob):
        return StoredDocument(blob.name, int(blob.size), blob.time_created.isoformat(),
                              blob.updated.isoformat(), int(blob.generation))

    def list(self, prefix):
        with storage_errors():
            # Iterate within the error boundary: pagination performs lazy I/O.
            return [self._record(blob) for blob in self._bucket().list_blobs(
                prefix=prefix, timeout=TIMEOUT, retry=RETRY)]

    def create(self, name, source, mime_type):
        with storage_errors(creating=True):
            blob = self._bucket().blob(name)
            source.seek(0, 2)
            size = source.tell()
            blob.upload_from_file(source, rewind=True, size=size, content_type=mime_type,
                                  if_generation_match=0, timeout=TIMEOUT, retry=RETRY)
            return self._record(blob)

    def get(self, name):
        with storage_errors(missing_object=True):
            blob = self._bucket().blob(name)
            blob.reload(timeout=TIMEOUT, retry=RETRY)
            return self._record(blob)

    def open(self, name, generation):
        with storage_errors(missing_object=True):
            # Generation-pinned range requests cannot mix replacement content.
            return GcsReader(self._bucket().blob(name, generation=generation).open(
                'rb', chunk_size=CHUNK_SIZE, raw_download=True, timeout=TIMEOUT, retry=RETRY))

    def delete(self, name, generation):
        with storage_errors(missing_object=True):
            # Delete the current live object only if it still has that generation.
            self._bucket().blob(name).delete(if_generation_match=generation,
                                             timeout=TIMEOUT, retry=RETRY)

    def close(self):
        if self._client is not None:
            self._client.close()
