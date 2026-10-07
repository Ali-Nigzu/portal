"""Disposable browser runner with a local HTTP Postmark provider stub; no GCP."""
import json
import os
from pathlib import Path
from threading import Thread
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from backend.app.data import documents_store
from backend.tests.run_membership_browser import main as run_portal


def main():
    if os.getenv('NODE_ENV') == 'production':
        raise RuntimeError('Test runtime forbidden in production')
    directory = Path(os.environ['PORTAL_TEST_MAIL_DIR'])
    directory.mkdir(parents=True, exist_ok=True)
    messages = []

    class Provider(BaseHTTPRequestHandler):
        def do_POST(self):
            messages.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
            temporary = directory / 'messages.tmp'
            temporary.write_text(json.dumps(messages))
            temporary.replace(directory / 'messages.json')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"MessageID":"local-provider-test", "ErrorCode":0}')

        def log_message(self, *args):
            pass  # Codes are never logged.

    provider = ThreadingHTTPServer(('127.0.0.1', 8001), Provider)
    Thread(target=provider.serve_forever, daemon=True).start()
    os.environ['POSTMARK_SERVER_TOKEN'] = 'local-provider-stub-only'
    os.environ['POSTMARK_FROM_EMAIL'] = 'test@local.invalid'
    os.environ['POSTMARK_EMAIL_ENDPOINT'] = 'http://127.0.0.1:8001/email'
    documents_store.DOCUMENTS_FILE = str(directory / 'documents.json')
    documents_store.DOCUMENT_BLOBS_DIR = str(directory / 'document_blobs')
    try:
        run_portal()
    finally:
        provider.shutdown()
        provider.server_close()


if __name__ == '__main__':
    main()
