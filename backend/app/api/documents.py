"""Private Documents APIs; ownership derives only from canonical sessions."""

from dataclasses import asdict
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from backend.app.auth import get_canonical_user
from backend.app.models_documents import DocumentError
from .organisation_memberships import NoStoreRoute, mutation_origin

router = APIRouter(route_class=NoStoreRoute)


def service(request: Request):
    return request.app.state.documents_service


def operation(callback):
    try:
        return callback()
    except DocumentError as error:
        raise HTTPException(error.status, error.message) from None


class DocumentStream(StreamingResponse):
    """Close the remote reader even when the browser cancels its download."""
    def __init__(self, *args, reader, **kwargs):
        super().__init__(*args, **kwargs)
        self.reader = reader

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            await run_in_threadpool(self.reader.close)


@router.get('/api/documents')
def list_documents(request: Request, user=Depends(get_canonical_user)):
    records = operation(lambda: service(request).list(user.id))
    return {'documents': [record.model_dump() for record in records]}


@router.post('/api/documents/upload', dependencies=[Depends(mutation_origin)])
async def upload_documents(request: Request, files: list[UploadFile] = File(default=[]),
                           user=Depends(get_canonical_user)):
    if not files:
        raise HTTPException(400, 'No files provided')
    try:
        result = await service(request).upload_batch(user.id, files)
    except DocumentError as error:
        raise HTTPException(error.status, error.message) from None
    return {'documents': [record.model_dump() for record in result.documents],
            'errors': [asdict(error) for error in result.errors]}


@router.get('/api/documents/{document_id}/download')
def download_document(document_id: str, request: Request, user=Depends(get_canonical_user)):
    document, reader, first = operation(lambda: service(request).download(user.id, document_id))
    # ASCII fallback avoids header injection and Latin-1 encoding failures;
    # filename* retains the exact Unicode name for modern browsers.
    fallback = ''.join(char if char.isascii() and (char.isalnum() or char in ' ._-') else '_'
                       for char in document.name) or 'document'
    headers = {
        'Content-Disposition': f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(document.name, safe="")}',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Length': str(document.sizeBytes),
    }
    return DocumentStream(service(request).chunks(reader, first), reader=reader,
                          media_type=document.mimeType, headers=headers)


@router.delete('/api/documents/{document_id}', status_code=204, dependencies=[Depends(mutation_origin)])
def delete_document(document_id: str, request: Request, user=Depends(get_canonical_user)):
    operation(lambda: service(request).delete(user.id, document_id))
