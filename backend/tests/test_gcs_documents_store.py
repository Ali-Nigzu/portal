"""Real google-cloud-storage SDK through an in-process HTTP transport.

No server/emulator, credentials, bucket provisioning or production access.
"""
import base64
import json
from email import policy
from email.parser import BytesParser
from io import BytesIO
from urllib.parse import parse_qs, unquote, urlsplit
from urllib3.response import HTTPResponse

import google_crc32c
import pytest
import requests
from google.api_core import exceptions
from google.auth.credentials import AnonymousCredentials
from google.cloud import storage

from backend.app.data.gcs_documents_store import GcsDocumentsStore, GcsReader, storage_errors
from backend.app.models_documents import DocumentError
from backend.app.services.documents_service import DocumentsService


class ObjectTransport(requests.Session):
    """Only the four SDK operations needed by this test, behind its HTTP seam."""
    def __init__(self):
        super().__init__()
        self.is_mtls = False
        self.objects = {}
        self.calls = []
        self.generation = 0
        self.failure = None

    def metadata(self, name):
        item = self.objects[name]
        return {'name':name,'bucket':'isolated-test','size':str(len(item['data'])),
            'generation':str(item['generation']),'timeCreated':'2026-10-08T10:00:00Z',
            'updated':'2026-10-08T10:00:00Z','contentType':item['mime'],
            'crc32c':base64.b64encode(google_crc32c.value(item['data']).to_bytes(4,'big')).decode()}

    def request(self, method, url, data=None, headers=None, **kwargs):
        parsed = urlsplit(url); query = parse_qs(parsed.query); headers = headers or {}
        self.calls.append((method,parsed.path,query,headers))
        status, body = 200, {}
        raw = None
        response_headers = {}
        if self.failure:
            status = self.failure
        elif parsed.path.startswith('/upload/'):
            assert query['uploadType'] == ['multipart']
            assert query['ifGenerationMatch'] == ['0']
            content_type = next(v for k,v in headers.items() if k.lower()=='content-type')
            if isinstance(content_type,bytes):content_type=content_type.decode()
            parts = list(BytesParser(policy=policy.default).parsebytes(
                ('Content-Type: '+content_type+'\r\n\r\n').encode()+data).iter_parts())
            metadata = json.loads(parts[0].get_payload(decode=True)); name = metadata['name']
            if name in self.objects:status=412
            else:
                self.generation+=1
                self.objects[name]={'data':parts[1].get_payload(decode=True),'mime':parts[1].get_content_type(), 'generation':self.generation}
                body=self.metadata(name)
        elif parsed.path.endswith('/o'):
            prefix=query.get('prefix',[''])[0]
            names=[name for name in self.objects if name.startswith(prefix)]
            start=int(query.get('pageToken',['0'])[0])
            body={'items':[self.metadata(name) for name in names[start:start+2]]}
            if len(names)>start+2:body['nextPageToken']=str(start+2)
        else:
            name=unquote(parsed.path.split('/o/',1)[1]); item=self.objects.get(name)
            if item is None:status=404
            elif query.get('generation',[str(item['generation'])])[0]!=str(item['generation']):status=404
            elif method=='DELETE':
                assert 'ifGenerationMatch' in query
                if query['ifGenerationMatch'][0]!=str(item['generation']):status=412
                else:del self.objects[name];status=204
            elif query.get('alt')==['media']:
                raw=item['data']
                range_header=next((v for k,v in headers.items() if k.lower()=='range'),None)
                if range_header:
                    start,end=range_header.replace('bytes=','').split('-'); start=int(start);end=min(int(end),len(raw)-1) if end else len(raw)-1
                    response_headers['Content-Range']=f'bytes {start}-{end}/{len(raw)}'
                    raw=raw[start:end+1];status=206
                response_headers['Content-Length']=str(len(raw))
                response_headers['x-goog-hash']='crc32c='+self.metadata(name)['crc32c']
            else:body=self.metadata(name)
        if status>=400:body={'error':{'code':status,'message':'secret provider error'}}
        response=requests.Response();response.status_code=status;response.url=url
        response.headers.update(response_headers)
        response._content=raw if raw is not None else json.dumps(body).encode()
        response.raw=HTTPResponse(body=BytesIO(response._content), headers=response.headers, preload_content=False)
        response.request=requests.Request(method,url).prepare()
        return response


def test_real_sdk_list_create_download_delete_preconditions():
    transport=ObjectTransport()
    client=storage.Client(project='isolated-test',credentials=AnonymousCredentials(),_http=transport)
    store=GcsDocumentsStore('isolated-test',client)
    service=DocumentsService(store)
    assert service.list(0)==[]
    item=store.create('0/manual.csv',BytesIO(b'one,two\n'),'text/csv')
    store.create('1/private.csv',BytesIO(b'secret'),'text/csv')
    store.create('0/nested/ignored.csv',BytesIO(b'ignored'),'text/csv')
    store.create('0/',BytesIO(b''),'application/octet-stream')
    records=service.list(0)
    assert [r.name for r in records]==['manual.csv'] and records[0].sizeBytes==8
    assert any(call[2].get('pageToken')==['2'] for call in transport.calls)
    with pytest.raises(DocumentError) as error:store.create('0/manual.csv',BytesIO(b'overwrite'),'text/csv')
    assert error.value.code=='duplicate_filename'
    record,reader,first=service.download(0,records[0].id)
    assert b''.join(service.chunks(reader,first))==b'one,two\n'
    assert reader.closed and record.name=='manual.csv'
    media=[call for call in transport.calls if call[2].get('alt')==['media']]
    assert media and media[0][2]['generation']==[str(item.generation)]
    with pytest.raises(DocumentError) as error:store.delete(item.name,item.generation+1)
    assert error.value.code=='document_changed'
    service.delete(0,records[0].id)
    assert service.list(0)==[] and store.get('1/private.csv')
    with pytest.raises(DocumentError) as error:service.download(0,records[0].id)
    assert error.value.status==404
    store.close()


@pytest.mark.parametrize('status',[403,404,503])
def test_real_sdk_unavailable_list_is_sanitized(status):
    transport=ObjectTransport();transport.failure=status
    client=storage.Client(project='isolated-test',credentials=AnonymousCredentials(),_http=transport)
    store=GcsDocumentsStore('isolated-test',client)
    # No retry delay in failure tests; production retains bounded retries.
    from unittest.mock import patch
    with patch('backend.app.data.gcs_documents_store.RETRY',None):
        with pytest.raises(DocumentError) as error:store.list('0/')
    assert error.value.status==503 and 'secret' not in error.value.message


def test_missing_object_precondition_and_late_reader_failure():
    for exception,status,kwargs in [(exceptions.NotFound('secret'),404,{'missing_object':True}),
        (exceptions.PreconditionFailed('secret'),409,{}),(exceptions.Forbidden('secret'),503,{})]:
        with pytest.raises(DocumentError) as error:
            with storage_errors(**kwargs):raise exception
        assert error.value.status==status and 'secret' not in error.value.message
    class Broken(BytesIO):
        def read(self,*args):raise exceptions.Forbidden('secret')
    reader=GcsReader(Broken())
    with pytest.raises(DocumentError):list(DocumentsService.chunks(reader,b'first'))
    assert reader.closed
