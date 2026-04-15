"""Documents API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from backend.app.auth import get_session_user
from backend.app.services.documents_service import documents_service

router = APIRouter()


@router.get("/api/documents")
async def list_documents(session_user: tuple[str, dict] = Depends(get_session_user)):
    account_id, _ = session_user
    documents = documents_service.list(account_id)
    return {"documents": [item.model_dump() for item in documents]}


@router.post("/api/documents/upload")
async def upload_documents(
    files: list[UploadFile] = File(default=[]),
    session_user: tuple[str, dict] = Depends(get_session_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    account_id, _ = session_user
    result = await documents_service.upload_batch(account_id, files)

    return {
        "documents": [item.model_dump() for item in result.documents],
        "errors": [error.__dict__ for error in result.errors],
    }


@router.get("/api/documents/{document_id}/download")
async def download_document(document_id: str, session_user: tuple[str, dict] = Depends(get_session_user)):
    account_id, _ = session_user
    document, payload = documents_service.download(account_id, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if payload is None:
        raise HTTPException(status_code=404, detail="Document blob missing")

    headers = {
        "Content-Disposition": f'attachment; filename="{document.name}"',
    }
    return Response(content=payload, media_type=document.mimeType, headers=headers)


@router.delete("/api/documents/{document_id}", status_code=204)
async def delete_document(document_id: str, session_user: tuple[str, dict] = Depends(get_session_user)):
    account_id, _ = session_user
    deleted = documents_service.delete(account_id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
