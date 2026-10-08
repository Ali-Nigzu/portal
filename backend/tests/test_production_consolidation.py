"""Frozen base contracts and canonical/compatibility composition boundaries.

Golden schema digest captured from c52142ce88ecf4b2b16e2b527e0e02c1a02a79b7,
using the pinned FastAPI/Pydantic versions without executing startup hooks.
"""
import ast
import hashlib
import json
from pathlib import Path

import pytest
from fastapi import Response
from fastapi.testclient import TestClient

from backend.app.app_factory import create_app, create_http_app
from backend.app.auth import set_auth_cookie, clear_auth_cookie
from backend.app.api.user_lifecycle import lifecycle_cookie, SIGNUP
from backend.app.services.admin_auth import set_admin_cookie, clear_admin_cookie

ROOT = Path(__file__).resolve().parents[2]


def test_exposed_api_schema_matches_exact_base():
    app = create_app()  # Construction only: no live startup/database requests.
    encoded = json.dumps(app.openapi(), sort_keys=True, separators=(',', ':')).encode()
    assert hashlib.sha256(encoded).hexdigest() == '5f00187899f2d88548b9415f14d1b27ef37ed65a11f89f28d90d8eea9415f1c1'
    app.state.documents_service.store.close()
    app.state.auth_repository.database.close()


def test_obsolete_environment_selector_cannot_replace_production_services(monkeypatch):
    from backend.app.services.canonical_auth import CanonicalAuthRepository
    from backend.app.services.admin_repository import AdminRepository
    from backend.app.data.gcs_documents_store import GcsDocumentsStore
    monkeypatch.setenv('PORTAL_BACKEND_MODE', 'local-new-account')
    monkeypatch.setenv('NODE_ENV', 'production')
    app = create_app()
    assert isinstance(app.state.auth_repository, CanonicalAuthRepository)
    assert isinstance(app.state.admin_repository, AdminRepository)
    assert isinstance(app.state.documents_service.store, GcsDocumentsStore)
    assert app.state.auth_repository.database is app.state.admin_repository.database
    app.state.documents_service.store.close()
    app.state.auth_repository.database.close()


@pytest.mark.parametrize('environment,override,secure', [
    ('production', None, True), ('development', None, False),
    ('production', 'false', False), ('development', 'true', True),
    ('production', '', True), ('development', 'TRUE', True),
    ('production', '0', False),
])
def test_cookie_options_keep_domain_specific_contracts(monkeypatch, environment, override, secure):
    monkeypatch.setenv('NODE_ENV', environment)
    if override is None:
        monkeypatch.delenv('PORTAL_SESSION_SECURE', raising=False)
    else:
        monkeypatch.setenv('PORTAL_SESSION_SECURE', override)
    customer, admin, challenge = Response(), Response(), Response()
    set_auth_cookie(customer, 'customer', 1800000000)
    set_admin_cookie(admin, 'admin', 1800000000)
    lifecycle_cookie(challenge, SIGNUP, 'challenge')
    for response in (customer, admin, challenge):
        assert ('; Secure' in response.headers['set-cookie']) is secure
        assert '; HttpOnly' in response.headers['set-cookie']
    assert 'camos_session=customer' in customer.headers['set-cookie']
    assert 'Max-Age=31536000' in customer.headers['set-cookie']
    assert 'SameSite=lax' in customer.headers['set-cookie']
    assert 'camos_admin_session=admin' in admin.headers['set-cookie']
    assert 'Max-Age=28800' in admin.headers['set-cookie']
    assert 'SameSite=lax' in admin.headers['set-cookie']
    assert 'Path=/api/signup' in challenge.headers['set-cookie']
    assert 'SameSite=strict' in challenge.headers['set-cookie']
    for clear in (clear_auth_cookie, clear_admin_cookie):
        response = Response()
        clear(response)
        assert ('; Secure' in response.headers['set-cookie']) is secure
        assert 'Max-Age=0' in response.headers['set-cookie']


def test_canonical_services_never_import_compatibility_or_fixtures():
    for path in (ROOT / 'backend/app').rglob('*.py'):
        if 'compatibility' in path.parts or path.name == 'app_factory.py':
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            modules = []
            if isinstance(node, ast.Import):
                modules = [entry.name for entry in node.names]
            elif isinstance(node, ast.ImportFrom):
                modules = [node.module or '']
            assert not any(module.startswith(('backend.app.compatibility', 'backend.tests', 'backend.dev'))
                           for module in modules), path


def test_compatibility_files_keep_paths_and_payloads_without_customer_sessions(tmp_path, monkeypatch):
    from backend.app.compatibility import json_store
    from backend.app.compatibility.api import interest
    users = tmp_path / 'users.json'
    alarms = tmp_path / 'alarms.json'
    devices = tmp_path / 'devices.json'
    users.write_text(json.dumps({'client1': {'password': 'historical', 'orgId': 'client1',
                                            'data_sources': [{'id': 'source'}]}}))
    alarms.write_text(json.dumps({'client1': [{'id': 'alarm'}]}))
    devices.write_text(json.dumps({'client1': [{'id': 'device'}]}))
    monkeypatch.setattr(json_store, 'USERS_FILE', str(users))
    monkeypatch.setattr(json_store, 'ALARM_LOGS_FILE', str(alarms))
    monkeypatch.setattr(json_store, 'DEVICE_LISTS_FILE', str(devices))
    monkeypatch.setattr(interest, 'INTEREST_SUBMISSIONS_FILE', str(tmp_path / 'interest.json'))
    client = TestClient(create_http_app())
    assert client.get('/api/alarm-logs', headers={'X-Demo-Session': '1'}).json() == {
        'alarms': [{'id': 'alarm'}], 'client_id': 'client1'}
    assert client.get('/api/device-list', headers={'X-Demo-Session': '1'}).json() == {
        'devices': [{'id': 'device'}], 'client_id': 'client1', 'data_sources': [{'id': 'source'}]}
    assert client.get('/api/me').status_code == 401
    assert client.get('/api/admin/me').status_code == 401
    assert not client.cookies
    response = client.post('/api/register-interest', json={
        'name': 'Example', 'email': 'example@example.com', 'company': 'Company'})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    records = json.loads((tmp_path / 'interest.json').read_text())
    assert records[0]['id'] == response.json()['submission_id']
    assert records[0]['name'] == 'Example'


def test_snapshot_compatibility_fallback_and_retirement_responses(monkeypatch):
    monkeypatch.delenv('BQ_PROJECT', raising=False)
    monkeypatch.delenv('BQ_DATASET', raising=False)
    client = TestClient(create_http_app(), headers={'X-Requested-With': 'camOS'})
    response = client.get('/api/snapshots/latest?org=client1')
    assert response.status_code == 200
    assert response.json()['ts'] == '2026-02-20T12:00:00Z'
    assert response.json()['payload'] == json.loads((ROOT / 'backend/data/demo_snapshot.json').read_text())['payload']
    assert response.json()['fallback'] is False
    assert client.get('/api/snapshots/latest?org=client1&strictSiteView=true').status_code == 422
    assert client.get('/api/snapshots/latest?org=client1&strictSiteView=true&siteView=all').status_code == 500
    assert client.get('/api/search-events').status_code == 410
    for path in ('/api/create-account', '/api/password-reset/verify'):
        response = client.post(path)
        assert response.status_code == 410
        assert response.headers['cache-control'] == 'no-store'


def test_contact_journal_append_precedes_email_and_persistence_failure_blocks_delivery(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from backend.app.api import auth
    journal = tmp_path / 'contact.json'
    journal.write_text(json.dumps([{'id': 'existing-record'}]))
    monkeypatch.setattr(auth, 'CONTACT_SUBMISSIONS_FILE', str(journal))
    calls = []
    def delivered(kind, **kwargs):
        records = json.loads(journal.read_text())
        assert records[0] == {'id': 'existing-record'}
        assert len(records) == 2
        assert records[1]['name'] == 'Example'
        assert records[1]['message'] == 'Please contact me.'
        calls.append(kind)
        return SimpleNamespace(message_id=kind)
    monkeypatch.setattr(auth, 'send_admin_contact_notification', lambda **kw: delivered('admin', **kw))
    monkeypatch.setattr(auth, 'send_contact_confirmation_email', lambda **kw: delivered('confirmation', **kw))
    client = TestClient(create_http_app())
    data = {'name': ' Example ', 'email': 'example@example.com', 'message': ' Please contact me. '}
    response = client.post('/api/contact', data=data)
    assert response.status_code == 200
    assert response.json() == {'message': "Thanks for contacting us. We'll be in touch soon."}
    assert calls == ['admin', 'confirmation']
    assert not Path(str(journal) + '.tmp').exists()
    before = journal.read_bytes()
    invalid_parent = tmp_path / 'not-a-directory'
    invalid_parent.write_text('file')
    monkeypatch.setattr(auth, 'CONTACT_SUBMISSIONS_FILE', str(invalid_parent / 'contact.json'))
    response = client.post('/api/contact', data=data)
    assert response.status_code == 500
    assert response.json() == {'detail': 'Failed to save contact message.'}
    assert calls == ['admin', 'confirmation']
    assert journal.read_bytes() == before
