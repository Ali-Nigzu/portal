"""Isolated Documents acceptance API: real session guard, in-memory objects.

Test runner only; no GCP/Postgres and no product admin-upload interface.
"""
import os
from io import BytesIO

import uvicorn
from fastapi import FastAPI, Request

from backend.app.api import auth, documents
from backend.tests.support.memory_documents_store import MemoryDocumentsStore
from backend.app.models_documents import DocumentError
from backend.app.services import passwords
from backend.app.services.canonical_auth import CanonicalUser
from backend.app.services.documents_service import DocumentsService


class BrowserObjects(MemoryDocumentsStore):
    unavailable = False

    def list(self, prefix):
        if self.unavailable:
            raise DocumentError(503, 'storage_unavailable', 'Documents are temporarily unavailable. Please try again.')
        return super().list(prefix)


def main():
    if os.getenv('NODE_ENV') == 'production':
        raise RuntimeError('Test runner forbidden in production')
    os.environ['PORTAL_SESSION_SECRET'] = 'isolated-documents-browser-session-secret-' * 2
    os.environ['PORTAL_SESSION_SECURE'] = 'false'
    password_hash = passwords.hash_password('documents-browser-password')
    users = [CanonicalUser(i, f'documents{i}@example.com', f'documents-user{i}', None,
                           password_hash, 1, 0) for i in (0, 1)]

    class Users:
        def get_enabled_user(self, user_id):
            return next((user for user in users if user.id == user_id), None)

        def find_user(self, identifier):
            return next((user for user in users if identifier.lower() in
                        {user.email.lower(), user.username.lower()}), None)

    app = FastAPI()
    store = BrowserObjects()
    app.state.auth_repository = Users()
    app.state.documents_service = DocumentsService(store)
    app.include_router(auth.router)
    app.include_router(documents.router)

    @app.get('/api/portal/organisations')
    def catalogue():
        return {'organisations': []}

    @app.get('/api/portal/me/memberships/pending')
    def pending():
        return {'invitations': [], 'requests': []}

    @app.post('/__test/documents')
    async def arrange(request: Request):
        body = await request.json()
        if body['action'] == 'add':
            store.create(body['name'], BytesIO(body.get('content','fixture').encode()), 'text/csv')
        elif body['action'] == 'remove':
            store.delete(body['name'], store.get(body['name']).generation)
        elif body['action'] == 'unavailable':
            store.unavailable = body['value']
        return {'ok': True}

    uvicorn.run(app, host='127.0.0.1', port=8000, log_level='warning')


if __name__ == '__main__':
    main()
