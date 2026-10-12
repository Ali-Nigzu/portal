"""Contact resource, journal and truthful delivery regression protection."""

import asyncio
import io
import json
import os
import tempfile
import threading
import time
import tracemalloc
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from backend.app.api.auth import router, submit_contact, CONTACT_MAX_FILE_BYTES
from backend.app.request_limits import RequestLimitsMiddleware
from backend.app.services import contact_journal, passwords
from backend.app.services.contact_limits import encoded_attachment_bytes, ATTACHMENT_ENVELOPE_BYTES
from backend.app.services.postmark_email import _postmark_send, PostmarkDeliveryError


class ContactTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.journal = str(Path(temporary.name) / 'contact.json')
        location = patch('backend.app.api.auth.CONTACT_SUBMISSIONS_FILE', self.journal)
        location.start(); self.addCleanup(location.stop)
        self.order = []
        self.result = SimpleNamespace(message_id='synthetic-message')
        for name, label in (('send_admin_contact_notification', 'admin'), ('send_contact_confirmation_email', 'confirmation')):
            mock = patch('backend.app.api.auth.' + name, side_effect=lambda label=label, **kwargs: self.mail(label))
            mock.start(); self.addCleanup(mock.stop)

    def mail(self, label):
        self.assertTrue(Path(self.journal).exists())
        self.order.append(label)
        return self.result

    async def submit(self, attachments=None):
        return await submit_contact(name='Contact Person', email='person@example.invalid', phone=None,
            company=None, message='A message', page_url=None, attachments=attachments or [])

    def test_normal_submission_order_and_optional_fields(self):
        result = asyncio.run(self.submit())
        self.assertIn('Thanks', result.message)
        self.assertEqual(self.order, ['admin', 'confirmation'])
        data = json.loads(Path(self.journal).read_text())
        self.assertEqual(data[0]['name'], 'Contact Person')
        self.assertIsNone(data[0]['company']); self.assertEqual(data[0]['attachments'], [])

    def test_small_attachment_and_count_type_bounds(self):
        upload = UploadFile(io.BytesIO(b'pdf content'), filename='sample.pdf')
        asyncio.run(self.submit([upload]))
        self.assertEqual(json.loads(Path(self.journal).read_text())[0]['attachments'], ['sample.pdf'])
        with self.assertRaises(HTTPException): asyncio.run(self.submit([upload] * 4))
        with self.assertRaises(HTTPException): asyncio.run(self.submit([UploadFile(io.BytesIO(b'x'), filename='file.exe')]))

    def test_aggregate_exact_boundary_and_detection_byte(self):
        overhead = encoded_attachment_bytes(0, 'file.pdf', 'application/octet-stream')
        size = (ATTACHMENT_ENVELOPE_BYTES - overhead) // 4 * 3
        self.assertLessEqual(encoded_attachment_bytes(size, 'file.pdf', 'application/octet-stream'), ATTACHMENT_ENVELOPE_BYTES)
        self.assertGreater(encoded_attachment_bytes(size + 3, 'file.pdf', 'application/octet-stream'), ATTACHMENT_ENVELOPE_BYTES)
        accepted = UploadFile(io.BytesIO(b'x' * size), filename='file.pdf')
        asyncio.run(self.submit([accepted]))
        Path(self.journal).unlink(); self.order.clear()
        rejected = UploadFile(io.BytesIO(b'x' * (size + 3)), filename='file.pdf')
        with self.assertRaises(HTTPException) as error: asyncio.run(self.submit([rejected]))
        self.assertEqual(error.exception.status_code, 422)
        self.assertFalse(Path(self.journal).exists()); self.assertEqual(self.order, [])

    def test_huge_unknown_size_stream_read_is_bounded(self):
        class HugeUpload:
            filename = 'large.pdf'; content_type = 'application/pdf'; size = None
            reads = []
            async def read(self, size):
                self.reads.append(size)
                return b'x' * size
        upload = HugeUpload()
        with self.assertRaises(HTTPException): asyncio.run(self.submit([upload]))
        self.assertEqual(len(upload.reads), 1)
        self.assertLess(upload.reads[0], CONTACT_MAX_FILE_BYTES)
        self.assertFalse(Path(self.journal).exists())

    def test_known_huge_size_rejected_without_read(self):
        upload = UploadFile(io.BytesIO(b'x'), filename='large.pdf', size=CONTACT_MAX_FILE_BYTES + 1)
        with patch.object(upload, 'read') as read:
            with self.assertRaises(HTTPException): asyncio.run(self.submit([upload]))
            read.assert_not_called()

    def test_slow_mail_does_not_block_unrelated_async_work(self):
        async def scenario():
            entered = threading.Event(); release = threading.Event()
            def slow(**kwargs): entered.set(); release.wait(2); return self.result
            with patch('backend.app.api.auth.send_admin_contact_notification', side_effect=slow):
                submission = asyncio.create_task(self.submit())
                try:
                    await asyncio.wait_for(asyncio.to_thread(entered.wait), 1)
                    await asyncio.wait_for(asyncio.sleep(.01), .15)
                    self.assertFalse(submission.done())
                finally: release.set()
                await submission
        asyncio.run(scenario())

    def test_partial_mail_failure_preserves_journal_and_does_not_claim_success(self):
        with patch('backend.app.api.auth.send_contact_confirmation_email', side_effect=RuntimeError('sensitive-body')):
            with self.assertLogs('backend.app.api.auth', level='ERROR') as logs:
                with self.assertRaises(HTTPException) as error: asyncio.run(self.submit())
        self.assertEqual(error.exception.status_code, 502)
        self.assertEqual(len(json.loads(Path(self.journal).read_text())), 1)
        self.assertNotIn('sensitive-body', ' '.join(logs.output))

    def test_slow_contact_allows_an_unrelated_http_request(self):
        async def scenario():
            entered = threading.Event(); release = threading.Event()
            def slow(**kwargs): entered.set(); release.wait(3); return self.result
            app = FastAPI(); app.add_middleware(RequestLimitsMiddleware); app.include_router(router)
            @app.get('/verification/ping')
            async def ping(): return {'ok': True}
            with patch('backend.app.api.auth.send_admin_contact_notification', side_effect=slow):
                async with AsyncClient(transport=ASGITransport(app),base_url='https://camos.app') as http:
                    contact=asyncio.create_task(http.post('/api/contact',data={'name':'Contact Person','email':'person@example.invalid','message':'A message'}))
                    try:
                        self.assertTrue(await asyncio.wait_for(asyncio.to_thread(entered.wait,1),1.5))
                        response=await asyncio.wait_for(http.get('/verification/ping'),.2)
                        self.assertEqual(response.json(),{'ok':True}); self.assertFalse(contact.done())
                    finally: release.set()
                    self.assertEqual((await contact).status_code,200)
        asyncio.run(scenario())

    def test_parser_rejects_oversized_form_before_consumption(self):
        app = FastAPI(); app.add_middleware(RequestLimitsMiddleware); app.include_router(router)
        with TestClient(app) as browser:
            response = browser.post('/api/contact', headers={'Content-Length': str(9 * 1024 * 1024)}, content=b'')
            self.assertEqual(response.status_code, 413)
            response = browser.post('/api/contact', data={'name':'Person', 'email':'person@example.invalid', 'message':'x' * (2 * 1024 * 1024)})
            self.assertIn(response.status_code, (400, 422, 413))
        self.assertFalse(Path(self.journal).exists())


class JournalTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(); self.addCleanup(directory.cleanup)
        self.path = str(Path(directory.name) / 'journal.json')

    def test_corrupt_or_non_array_journal_is_preserved(self):
        for original in (b'{bad', b'{}', b'[{}', b'[{}] trailing'):
            with self.subTest(original=original):
                Path(self.path).write_bytes(original)
                with self.assertRaises(Exception): contact_journal.append(self.path, {'id':'new'})
                self.assertEqual(Path(self.path).read_bytes(), original)

    def test_concurrent_appends_lose_no_records(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda i: contact_journal.append(self.path, {'id':i}), range(32)))
        self.assertEqual({record['id'] for record in json.loads(Path(self.path).read_text())}, set(range(32)))

    def test_history_memory_does_not_scale_with_complete_array(self):
        with open(self.path, 'w') as output:
            json.dump([{'id':i, 'message':'x' * 1024} for i in range(8000)], output)
        tracemalloc.start()
        try:
            contact_journal.append(self.path, {'id':8000})
            _, peak = tracemalloc.get_traced_memory()
        finally: tracemalloc.stop()
        self.assertLess(peak, 3 * 1024 * 1024)
        data = json.loads(Path(self.path).read_text())
        self.assertEqual(len(data), 8001); self.assertEqual(data[-1]['id'], 8000)


class MailResponseTests(unittest.TestCase):
    def send(self, body):
        class Response:
            status = 200
            def read(self, size): return body
            def __enter__(self): return self
            def __exit__(self, *args): pass
        with patch('backend.app.services.postmark_email.request.urlopen', return_value=Response()):
            return _postmark_send(token='synthetic-token', payload={'TextBody':'test'}, from_email='sender@example.invalid',
                                 to_email='recipient@example.invalid', endpoint='https://api.postmarkapp.com/email')

    def test_documented_success_is_required(self):
        data = {'ErrorCode':0, 'Message':'OK', 'To':'recipient@example.invalid',
                'MessageID':'11111111-2222-3333-4444-555555555555', 'SubmittedAt':'2026-10-12T12:00:00Z'}
        self.assertEqual(self.send(json.dumps(data).encode()).message_id, data['MessageID'])
        for body in (b'<html>proxy error</html>', b'{}', json.dumps({**data, 'ErrorCode':1}).encode(),
                     json.dumps({k:v for k,v in data.items() if k != 'MessageID'}).encode(), b'x' * 65537):
            with self.subTest(body_length=len(body)), self.assertRaises(PostmarkDeliveryError): self.send(body)


class PasswordResourceTests(unittest.TestCase):
    def test_hash_concurrency_is_bounded_without_weakening_policy(self):
        active = 0; peak = 0; lock = threading.Lock()
        def work(value):
            nonlocal active, peak
            with lock: active += 1; peak = max(peak, active)
            time.sleep(.03)
            with lock: active -= 1
            return 'hash'
        with patch.object(passwords, 'hasher', SimpleNamespace(hash=work)):
            with ThreadPoolExecutor(max_workers=8) as pool:
                self.assertEqual(list(pool.map(passwords.hash_password, ['password'] * 8)), ['hash'] * 8)
        self.assertLessEqual(peak, passwords.HASH_CONCURRENCY)
        self.assertEqual(passwords.hasher.memory_cost, 65536)
        self.assertEqual(passwords.hasher.time_cost, 3)
