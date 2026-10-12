"""Per-request/body and per-instance upload bounds, before FastAPI form parsing."""

import asyncio
from starlette.formparsers import MultiPartException
from starlette.responses import JSONResponse

CONTACT_BODY_BYTES = 8 * 1024 * 1024
DOCUMENT_BODY_BYTES = 32 * 1024 * 1024
JSON_BODY_BYTES = 32 * 1024


class RequestLimitsMiddleware:
    def __init__(self, app):
        self.app = app
        self.uploads = asyncio.Semaphore(2)
        self.exports = asyncio.Semaphore(2)
        self.admin_writes = asyncio.Semaphore(1)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        path = scope.get('path', '').rstrip('/')
        export = scope['method'] == 'GET' and path.startswith('/api/') and path.endswith('/events/export')
        if scope['method'] not in ('POST', 'PUT', 'PATCH') and not export:
            return await self.app(scope, receive, send)
        upload = path in ('/api/contact', '/api/documents/upload')
        admin_write = path.startswith('/api/admin/') and path not in ('/api/admin/login', '/api/admin/logout')
        limit = (CONTACT_BODY_BYTES if path == '/api/contact' else DOCUMENT_BODY_BYTES
                 if path == '/api/documents/upload' or admin_write else JSON_BODY_BYTES)
        headers = dict(scope.get('headers', []))
        try:
            length = int(headers.get(b'content-length', b'0'))
            if length < 0:
                raise ValueError()
        except ValueError:
            return await JSONResponse({'detail': 'Invalid request size.'}, 400,
                headers={'Cache-Control': 'no-store'})(scope, receive, send)
        if length > limit:
            return await JSONResponse({'detail': 'Request body is too large.'}, 413,
                headers={'Cache-Control': 'no-store'})(scope, receive, send)
        acquired = False
        try:
            transfer_slots = self.exports if export else self.admin_writes if admin_write else self.uploads
            if upload or export or admin_write:
                try:
                    await asyncio.wait_for(transfer_slots.acquire(), timeout=10)
                    acquired = True
                except TimeoutError:
                    return await JSONResponse({'detail': 'Upload service busy. Please retry.'}, 503,
                        headers={'Cache-Control': 'no-store'})(scope, receive, send)
            consumed = 0
            async def bounded_receive():
                nonlocal consumed
                message = await receive()
                if message['type'] == 'http.request':
                    consumed += len(message.get('body', b''))
                    if consumed > limit:
                        # Multipart parsers close their spooled files on this
                        # exception. No excess body is returned to the parser.
                        raise MultiPartException('Request body is too large.')
                return message
            await self.app(scope, bounded_receive, send)
        finally:
            if acquired:
                transfer_slots.release()
