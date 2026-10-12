"""Small, safe request context shared with synchronous domain adapters."""

from contextvars import ContextVar
import logging
from uuid import uuid4
from starlette.responses import JSONResponse

request_context = ContextVar('camos_request_id', default='-')


def request_id():
    current = request_context.get()
    return current if current != '-' else uuid4().hex


class RequestLogFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_context.get()
        return True


class RequestDiagnosticsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        token = request_context.set(uuid4().hex)
        started = False
        async def correlated_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
                message['headers'] = [*message.get('headers', []),
                                      (b'x-request-id', request_context.get().encode())]
            await send(message)
        try:
            await self.app(scope, receive, correlated_send)
        except Exception as error:
            route = getattr(scope.get('route'), 'path', 'unmatched')
            logging.getLogger(__name__).warning('request.unavailable operation=%s category=%s', route, type(error).__name__)
            if not started:
                await JSONResponse({'detail': 'Service temporarily unavailable. Please retry.'}, 503,
                    headers={'Cache-Control': 'no-store'})(scope, receive, correlated_send)
            # After response start, abort the incomplete stream with a safe
            # exception rather than claiming successful delivery.
            else:
                raise RuntimeError('Response stream interrupted') from None
        finally:
            request_context.reset(token)
