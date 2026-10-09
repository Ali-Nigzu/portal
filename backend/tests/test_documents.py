"""Documents policy and HTTP isolation with the actual canonical session guard."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile

from backend.app.api import documents
from backend.tests.support.memory_documents_store import MemoryDocumentsStore
from backend.app.models_documents import DocumentError, document_id
from backend.app.services.documents_service import DocumentsService, MAX_UPLOAD_BYTES
from backend.app.services.session_tokens import create_session


@pytest.fixture
def boundary(monkeypatch):
    monkeypatch.setenv('PORTAL_SESSION_SECRET', 'documents-test-session-secret-' * 2)
    store = MemoryDocumentsStore()
    app = FastAPI()
    app.state.documents_service = DocumentsService(store)
    users = {i: SimpleNamespace(id=i, username=f'user{i}', session_version=0) for i in (0, 1, 10)}
    app.state.auth_repository = SimpleNamespace(get_enabled_user=lambda i: users.get(i))
    app.include_router(documents.router)
    with TestClient(app) as client:
        client.cookies.set('camos_session', create_session(0, session_version=0)[0])
        yield client, store, users


def upload(client, name='contract.pdf', content=b'%PDF-test', mime='application/pdf'):
    return client.post('/api/documents/upload', files=[('files', (name, content, mime))],
                       headers={'X-Requested-With': 'camOS'})


def test_complete_journey_and_canonical_rename(boundary):
    client, store, users = boundary
    assert client.get('/api/documents').json() == {'documents': []}
    store.create('0/admin.csv', BytesIO(b'one,two\n'), 'text/csv')
    record = client.get('/api/documents?user_id=1').json()['documents'][0]
    assert record['name'] == 'admin.csv' and record['accountId'] == '0'
    assert record['sizeBytes'] == 8 and record['type'] == 'csv'
    users[0].username = 'renamed'
    assert client.get('/api/documents').json()['documents'][0]['id'] == record['id']
    result = upload(client).json()
    assert not result['errors'] and result['documents'][0]['name'] == 'contract.pdf'
    value = result['documents'][0]['id']
    response = client.get(f'/api/documents/{value}/download')
    assert response.content == b'%PDF-test'
    assert response.headers['content-type'] == 'application/pdf'
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert "filename*=UTF-8''contract.pdf" in response.headers['content-disposition']
    assert client.delete(f'/api/documents/{value}', headers={'X-Requested-With': 'camOS'}).status_code == 204
    assert client.get(f'/api/documents/{value}/download').status_code == 404
    assert [r['name'] for r in client.get('/api/documents').json()['documents']] == ['admin.csv']


def test_cross_user_scope_and_prefix_boundary(boundary):
    client, store, _ = boundary
    for user in (0, 1, 10):
        store.create(f'{user}/user{user}.csv', BytesIO(str(user).encode()), 'text/csv')
    value = document_id('user0.csv')
    client.cookies.set('camos_session', create_session(1, session_version=0)[0])
    assert [r['name'] for r in client.get('/api/documents?user_id=0').json()['documents']] == ['user1.csv']
    assert client.get(f'/api/documents/{value}/download').status_code == 404
    assert client.delete(f'/api/documents/{value}', headers={'X-Requested-With': 'camOS'}).status_code == 404
    assert store.get('0/user0.csv')
    assert upload(client, '0/stolen.csv').json()['errors'][0]['code'] == 'unsafe_filename'
    assert upload(client, 'mine.csv', b'mine', 'text/csv').json()['documents'][0]['accountId'] == '1'
    assert store.get('1/mine.csv')


def test_unauthenticated_revoked_and_mutation_origin(boundary):
    client, _, users = boundary
    assert upload(client).status_code == 200
    assert client.post('/api/documents/upload', files={'files': ('x.csv', b'x')}).status_code == 403
    assert client.delete('/api/documents/'+document_id('contract.pdf'),
                         headers={'X-Requested-With':'camOS','Origin':'https://evil.invalid'}).status_code == 403
    users[0].session_version = 1
    assert client.get('/api/documents').status_code == 401
    client.cookies.clear()
    for method, path in [('get','/api/documents'),('get','/api/documents/a/download'),('delete','/api/documents/a')]:
        response = getattr(client, method)(path, headers={'X-Requested-With':'camOS'})
        assert response.status_code == 401


@pytest.mark.parametrize('name', ['../x.csv','1/x.csv','/x.csv',r'1\x.csv','C:x.csv','..','x\u202ecsv', 'x'*252+'.csv'])
def test_unsafe_filenames(boundary, name):
    client, store, _ = boundary
    result = upload(client, name, b'x', 'text/csv').json()
    assert result['documents'] == [] and result['errors'][0]['code'] == 'unsafe_filename'
    assert store.list('0/') == []


@pytest.mark.parametrize('extension', ['pdf','csv','xlsx','docx'])
def test_allowed_extensions_not_client_mime(boundary, extension):
    client, _, _ = boundary
    result = upload(client, 'file.'+extension.upper(), b'data', 'application/octet-stream').json()
    assert result['documents'][0]['type'] == extension
    assert not result['errors']


def test_type_spoofing_duplicate_partial_batch_and_size(boundary):
    client, store, _ = boundary
    assert upload(client, 'x.exe', b'x', 'application/pdf').json()['errors'][0]['code'] == 'unsupported_type'
    upload(client, 'exists.csv', b'original', 'text/csv')
    result = client.post('/api/documents/upload', files=[('files',('exists.csv',b'replacement','text/csv')),
        ('files',('new.csv',b'new','text/csv'))], headers={'X-Requested-With':'camOS'}).json()
    assert result['errors'][0]['code'] == 'duplicate_filename' and result['errors'][0]['index'] == 0
    assert [r['name'] for r in result['documents']] == ['new.csv']
    assert store.open('0/exists.csv',store.get('0/exists.csv').generation).read() == b'original'
    assert upload(client,'limit.csv',b'x'*MAX_UPLOAD_BYTES,'text/csv').json()['documents']
    assert upload(client,'too-big.csv',b'x'*(MAX_UPLOAD_BYTES+1),'text/csv').json()['errors'][0]['code'] == 'too_large'
    assert client.post('/api/documents/upload',headers={'X-Requested-With':'camOS'}).status_code == 400


def test_concurrent_create_is_atomic():
    store = MemoryDocumentsStore()
    def create(_):
        try: return store.create('0/same.csv', BytesIO(b'data'),'text/csv')
        except DocumentError as error: return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(create, range(2)))
    assert sum(r == 'duplicate_filename' for r in results) == 1
    assert len(store.list('0/')) == 1


def test_nested_markers_unknown_types_and_safe_download_name(boundary):
    client, store, _ = boundary
    for name in ['0/','0/nested/file.csv','0/../file.csv','0/bad\n.csv','0/notes.bin','0/café "report".csv','1/private.csv']:
        store.create(name,BytesIO(b'data'),'application/octet-stream')
    records = client.get('/api/documents').json()['documents']
    assert {r['name'] for r in records} == {'notes.bin','café "report".csv'}
    value = document_id('café "report".csv')
    response = client.get(f'/api/documents/{value}/download')
    assert response.status_code == 200
    assert 'caf%C3%A9%20%22report%22.csv' in response.headers['content-disposition']
    assert '\n' not in response.headers['content-disposition']
    assert client.get('/api/documents/'+document_id('notes.bin')+'/download').headers['content-type'] == 'application/octet-stream'


@pytest.mark.parametrize('value',['!','Li4vMS9zZWNyZXQuY3N2','L3NlY3JldC5jc3Y','YQ==','_w','x'*341])
def test_invalid_object_identifiers(boundary,value):
    client, _, _ = boundary
    assert client.get(f'/api/documents/{value}/download').status_code == 404


def test_storage_failure_is_not_an_empty_list_or_fallback(boundary, monkeypatch):
    client, store, _ = boundary
    def fail(*args): raise DocumentError(503,'storage_unavailable','Documents are temporarily unavailable. Please try again.')
    monkeypatch.setattr(store,'list',fail)
    response = client.get('/api/documents')
    assert response.status_code == 503 and 'documents' not in response.json()
    assert response.headers['cache-control'] == 'no-store'
    monkeypatch.setattr(store,'create',fail)
    assert upload(client,'x.csv',b'data','text/csv').json()['errors'][0]['code'] == 'storage_unavailable'


def test_download_closes_reader(boundary, monkeypatch):
    client, store, _ = boundary
    upload(client,'x.csv',b'data','text/csv')
    reader=BytesIO(b'data')
    monkeypatch.setattr(store,'open',lambda *args:reader)
    assert client.get('/api/documents/'+document_id('x.csv')+'/download').content == b'data'
    assert reader.closed


def test_generation_race_is_safe():
    store=MemoryDocumentsStore()
    record=store.create('0/x.csv',BytesIO(b'old'),'text/csv')
    store.delete(record.name,record.generation)
    store.create(record.name,BytesIO(b'new'),'text/csv')
    for operation in (store.open,store.delete):
        with pytest.raises(DocumentError) as error: operation(record.name,record.generation)
        assert error.value.code == 'document_changed'


def test_control_characters_rejected_before_storage():
    from backend.app.models_documents import safe_filename
    for name in ('\r\nx.csv', 'x\x00.csv', 'x\u202e.csv'):
        with pytest.raises(DocumentError) as error: safe_filename(name)
        assert error.value.code == 'unsafe_filename'


@pytest.mark.parametrize('disk', [False, True], ids=['memory-spool', 'disk-spool'])
@pytest.mark.parametrize('size', [0, MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES + 1])
def test_existing_upload_spool_boundaries_and_lifetime(disk, size):
    import asyncio
    from tempfile import SpooledTemporaryFile
    source = SpooledTemporaryFile(max_size=1 if disk else MAX_UPLOAD_BYTES + 2)
    source.write(b'x' * size)
    source.seek(0)
    if disk:
        source.rollover()
    calls = []
    store = MemoryDocumentsStore()
    create = store.create
    def observed(name, uploaded, mime):
        assert not source.closed and not uploaded.closed
        calls.append(uploaded)
        return create(name, uploaded, mime)
    store.create = observed
    result = asyncio.run(DocumentsService(store).upload_batch(0, [UploadFile(source, filename='file.csv')]))
    assert source.closed
    if size > MAX_UPLOAD_BYTES:
        assert not calls and result.errors[0].code == 'too_large'
    else:
        assert len(calls) == 1 and result.documents[0].sizeBytes == size
        assert not result.errors


def test_upload_validation_order_batch_order_and_cancel_cleanup():
    import asyncio
    files = [UploadFile(BytesIO(b'x'), filename=name) for name in
             ['../unsafe.exe', 'unsupported.exe', 'good.csv', 'good.csv', 'last.pdf']]
    store = MemoryDocumentsStore()
    calls = []
    create = store.create
    def observed(name, source, mime):
        calls.append(name)
        return create(name, source, mime)
    store.create = observed
    result = asyncio.run(DocumentsService(store).upload_batch(0, files))
    assert calls == ['0/good.csv', '0/good.csv', '0/last.pdf']
    assert [(error.index, error.code) for error in result.errors] == [
        (0, 'unsafe_filename'), (1, 'unsupported_type'), (3, 'duplicate_filename')]
    assert all(upload.file.closed for upload in files)

    class CancelledUpload(UploadFile):
        async def read(self, size=-1):
            raise asyncio.CancelledError()
    cancelled = CancelledUpload(BytesIO(b'x'), filename='cancel.csv')
    remaining = UploadFile(BytesIO(b'x'), filename='remaining.csv')
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(DocumentsService(store).upload_batch(0, [cancelled, remaining]))
    assert cancelled.file.closed and remaining.file.closed
    assert '0/cancel.csv' not in calls
