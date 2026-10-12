"""Real PostgreSQL isolation/fallback tests and bounded integration adapters."""

import json
import os
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

from backend.tests.support import TestDatabase, application, client
from backend.tests.test_provider_oidc import ENV
from backend.app.api import authenticated_portal, portal
from backend.app.services.session_tokens import create_session
from backend.app.services.organisation_dashboard import OrganisationDashboard, build_zero_snapshot
from backend.app.services.portal_context import PortalMetadata, PortalScope, PortalIdentity
from backend.app.services.portal_devices import PortalDevices
from backend.app.services.bigquery_client import BigQueryClient
from backend.app.services.dashboard_postgres import DashboardPostgres
from backend.app.data.gcs_documents_store import GcsDocumentsStore, GcsReader
from backend.app.models_documents import DocumentError


class CountingDatabase:
    def __init__(self, database):
        self.database, self.queries = database, []

    @contextmanager
    def connection(self):
        with self.database.connection() as connection:
            parent = self
            class Cursor:
                def __init__(self): self.real = connection.cursor()
                def execute(self, sql, params=()):
                    parent.queries.append(sql)
                    return self.real.execute(sql, params)
                def __getattr__(self, name): return getattr(self.real, name)
            yield SimpleNamespace(cursor=Cursor)


@unittest.skipUnless(os.getenv('CAMOS_TEST_POSTGRES_PORT'), 'Disposable localhost PostgreSQL not configured')
class PortalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = TestDatabase(); cls.database.setup()
        for sql in (
            'CREATE TABLE IF NOT EXISTS organisations(id bigint PRIMARY KEY,name text,enabled boolean)',
            'CREATE TABLE IF NOT EXISTS sites(id bigint PRIMARY KEY,organisation_id bigint REFERENCES organisations(id),name text,enabled boolean,max_capacity integer)',
            'CREATE TABLE IF NOT EXISTS memberships(user_id bigint REFERENCES users(id),organisation_id bigint REFERENCES organisations(id),role smallint,status smallint)',
            'CREATE TABLE IF NOT EXISTS devices(id bigint PRIMARY KEY,site_id bigint REFERENCES sites(id),name text,enabled boolean,analyzed_until timestamptz)',
            'CREATE TABLE IF NOT EXISTS gateways(gateway_id text PRIMARY KEY,site_id bigint REFERENCES sites(id),desired_state smallint,last_seen_at timestamptz)',
            'CREATE TABLE IF NOT EXISTS organisation_snapshots(organisation_id bigint PRIMARY KEY REFERENCES organisations(id),ts timestamptz,payload jsonb)',
            'CREATE TABLE IF NOT EXISTS site_snapshots(site_id bigint PRIMARY KEY REFERENCES sites(id),ts timestamptz,payload jsonb)',
        ): cls.database.execute(sql)

    def setUp(self):
        self.env = patch.dict(os.environ, ENV); self.env.start(); self.addCleanup(self.env.stop)
        self.database.reset()
        self.database.execute('TRUNCATE organisations CASCADE')
        self.user = self.database.add_user()
        self.database.execute("INSERT INTO organisations VALUES(1,'Demo',true),(2,'Customer',true),(3,'Other',true)")
        self.database.execute("INSERT INTO sites VALUES(11,1,'Demo site',true,10),(21,2,'Customer site',true,100),(31,3,'Other site',true,100)")
        self.database.execute('INSERT INTO memberships VALUES(%s,2,0,1)', (self.user.id,))
        self.database.execute("INSERT INTO devices VALUES(210,21,'Current',true,CURRENT_TIMESTAMP),(310,31,'Foreign',true,CURRENT_TIMESTAMP)")
        self.database.execute("INSERT INTO gateways VALUES('gw21',21,2,CURRENT_TIMESTAMP)")
        self.counted = CountingDatabase(self.database)
        self.app = application(self.counted)
        self.app.include_router(authenticated_portal.router); self.app.include_router(portal.router)
        self.app.state.organisation_dashboard = OrganisationDashboard(self.counted)
        self.app.state.portal_metadata = PortalMetadata(self.counted, self.app.state.organisation_dashboard)
        self.bq = Mock(); self.bq.portal_rows.return_value = []
        self.app.state.portal_devices = PortalDevices(self.counted, self.bq)
        self.http = client(self.app); self.addCleanup(self.http.close)
        self.http.cookies.set('camos_session',create_session(self.user.id)[0],domain='camos.app',path='/')
        self.ts = datetime(2026,3,29,3,30,tzinfo=timezone.utc)

    def snapshot(self, site=21, malformed=False):
        payload = build_zero_snapshot('site',site,'Site',self.ts)['payload']
        if malformed: payload['occupancy_96'][3] = None
        self.database.execute('INSERT INTO site_snapshots VALUES(%s,%s,%s::jsonb)', (site,self.ts,json.dumps(payload)))

    def test_valid_snapshot_uses_three_queries_and_no_metadata(self):
        self.snapshot(); self.counted.queries.clear()
        response = self.http.get('/api/portal/organisations/2/sites/21/snapshot')
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(self.counted.queries),3)  # User + membership + scoped snapshot.
        self.assertFalse(any('public.devices' in sql for sql in self.counted.queries))
        self.assertEqual(response.headers['cache-control'],'no-store')
        self.assertEqual(len(response.headers['x-request-id']),32)

    def test_missing_and_corrupt_snapshot_have_fresh_real_metadata(self):
        for malformed in (False, True):
            if malformed: self.snapshot(malformed=True)
            self.counted.queries.clear()
            response = self.http.get('/api/portal/organisations/2/sites/21/snapshot')
            self.assertEqual(response.status_code,200)
            data=response.json(); self.assertEqual(data['entity_name'],'Customer site')
            self.assertEqual(data['payload']['traffic_devices'],[{'device_id':'210','name':'Current'}])
            self.assertEqual(len(self.counted.queries),7)
            self.assertEqual(data['payload']['entrances_96'],[0]*96)

    def test_foreign_scope_revocation_and_errors_are_private(self):
        self.snapshot(site=31)
        for path in ('/api/portal/organisations/3/sites/31/snapshot','/api/portal/organisations/2/sites/31/snapshot'):
            response=self.http.get(path); self.assertEqual(response.status_code,404)
            self.assertEqual(response.headers['cache-control'],'no-store')
        self.database.execute('UPDATE memberships SET status=2')
        self.assertEqual(self.http.get('/api/portal/organisations/2/snapshot').status_code,404)

    def test_demo_nested_corruption_is_safe_and_never_zero_fallback(self):
        self.snapshot(site=11,malformed=True)
        response=self.http.get('/api/demo/dashboard/sites/11/snapshot')
        # Public Demo uses its fixed identity, independent of the customer.
        self.assertEqual(response.status_code,502)
        self.assertEqual(response.json()['detail']['error'],'invalid_snapshot')

    def test_control_writes_origin_marker_and_cross_org(self):
        path='/api/portal/organisations/2/devices/210/enabled'
        for headers in ({'Origin':'https://evil.invalid'}, {'X-Requested-With':''}, {'Origin':''}):
            response=self.http.put(path,json={'enabled':False},headers=headers)
            self.assertEqual(response.status_code,403)
            self.assertEqual(response.headers['cache-control'],'no-store')
        response=self.http.put(path,json={'enabled':False})
        self.assertEqual(response.status_code,200); self.assertFalse(response.json()['source']['canonical_enabled'])
        self.assertEqual(self.http.put('/api/portal/organisations/2/devices/310/enabled',json={'enabled':False}).status_code,404)
        self.assertEqual(self.http.put(path,json={'enabled':'false'}).status_code,422)

    def test_above_ten_thousand_historical_groups_are_one_complete_aggregate(self):
        # The adapter represents 15,000 historical groups + current records.
        # Only the site total and current pair cross the REST boundary.
        self.bq.portal_rows.return_value=[{'site_id':21,'device_id':None,'site_total':1,'record_count':15007},
            {'site_id':21,'device_id':210,'site_total':0,'record_count':7}]
        response=self.http.get('/api/portal/organisations/2/devices')
        self.assertEqual(response.status_code,200)
        items={item['ref']:item for item in response.json()['items']}
        self.assertEqual(items['gateway:21']['records'],15007)
        self.assertEqual(items['device:210']['records'],7)
        sql,params=self.bq.portal_rows.call_args.args
        self.assertIn('GROUPING SETS',sql); self.assertNotIn('LIMIT 10000',sql)
        self.assertEqual(params,{'org':2,'sites':[21],'pairs':['21:210']})
        self.assertEqual(self.bq.portal_rows.call_args.kwargs['limit'],3)
        self.assertEqual(self.bq.portal_rows.call_count,1)
        self.bq.portal_rows.return_value *= 2
        failed=self.http.get('/api/portal/organisations/2/devices').json()
        self.assertEqual(failed['records_status'],'unavailable')
        self.assertTrue(all(item['records'] is None for item in failed['items']))

    def test_nonunique_case_preserved_names_keep_neutral_invite_ambiguity(self):
        from backend.app.services.organisation_membership_repository import OrganisationMembershipRepository
        from backend.app.services.organisation_memberships import OrganisationMemberships, MembershipError
        first=self.database.add_user('first@example.invalid','MiXeD')
        self.database.add_user('second@example.invalid','mIxEd')
        repository=OrganisationMembershipRepository(self.database)
        with self.database.connection() as connection:
            self.assertIsNone(repository.invite_target(connection,'username','missing'))
            self.assertEqual(repository.invite_target(connection,'email','FIRST@example.invalid')['username'],'MiXeD')
            self.assertEqual(repository.invite_target(connection,'username','mixed'),{'ambiguous':True})
        service=OrganisationMemberships(repository)
        with patch.object(service,'_actor'), patch.object(service,'_organisation'), patch.object(service,'_member'):
            with self.assertRaises(MembershipError) as error:
                service.initiate(first,'2',identifier_type='username',identifier='MIXED')
        self.assertEqual(error.exception.message,"Please use the user's email address.")

    def test_real_pool_concurrency_and_rollback_return_healthy_connections(self):
        active=peak=0; lock=Lock()
        def connect():
            driver=self.database.connect();driver.autocommit=True;return driver
        with patch.object(DashboardPostgres,'_connect',side_effect=connect):
            pool=DashboardPostgres()
            def read(_):
                nonlocal active,peak
                with pool.connection() as connection:
                    with lock: active+=1;peak=max(peak,active)
                    try:
                        cursor=connection.cursor();cursor.execute('SELECT pg_sleep(0.02),1');self.assertEqual(cursor.fetchone()[1],1);cursor.close()
                    finally:
                        with lock:active-=1
            try:
                with ThreadPoolExecutor(max_workers=12) as workers:list(workers.map(read,range(12)))
                self.assertLessEqual(peak,4);self.assertEqual(pool._pool.checkedout(),0)
                with self.assertRaises(RuntimeError):
                    with pool.transaction() as connection:
                        cursor=connection.cursor();cursor.execute('UPDATE users SET phone_number=%s WHERE id=%s',('temporary',self.user.id));cursor.close()
                        raise RuntimeError('rollback')
                self.assertIsNone(self.database.execute('SELECT phone_number FROM users WHERE id=%s',(self.user.id,))[0][0])
                with pool.connection() as connection:self.assertTrue(connection.driver_connection.autocommit)
            finally:pool.close()


class IntegrationBoundTests(unittest.TestCase):
    def test_bigquery_caps_deadlines_and_cancels_failure(self):
        adapter=BigQueryClient(); adapter._client=Mock()
        job=adapter._client.query.return_value; job.result.return_value=iter([{'n':1}])
        self.assertEqual(adapter.portal_rows('SELECT @org',{'org':2},limit=21),[{'n':1}])
        options=adapter._client.query.call_args.kwargs
        self.assertEqual(options['timeout'],10); self.assertIsNone(options['job_retry'])
        self.assertEqual(options['job_config'].maximum_bytes_billed,1000000000)
        self.assertEqual(job.result.call_args.kwargs['max_results'],21)
        self.assertEqual(job.result.call_args.kwargs['timeout'],30)
        job.result.side_effect=TimeoutError('private query details')
        with self.assertRaises(TimeoutError): adapter.portal_rows('SELECT 1',{},limit=1)
        job.cancel.assert_called_once_with(timeout=5,retry=None)

    def test_pool_has_four_connections_no_overflow_and_ten_second_wait(self):
        database=DashboardPostgres()
        self.assertEqual(database._pool.size(),4)
        self.assertEqual(database._pool._max_overflow,0)
        self.assertEqual(database._pool.timeout(),10)
        database._connector=Mock(); driver=database._connector.connect.return_value
        self.assertIs(database._connect(),driver)
        self.assertEqual(database._connector.connect.call_args.kwargs['timeout'],10)
        queries=[call.args[0] for call in driver.cursor.return_value.execute.call_args_list]
        self.assertIn("SET statement_timeout = '10s'",queries)
        driver.cursor.return_value.execute.side_effect=RuntimeError()
        with self.assertRaises(RuntimeError): database._connect()
        driver.close.assert_called_once()
        database.close()

    def test_gcs_generation_preconditions_timeouts_and_lazy_error(self):
        client=Mock(); blob=client.bucket.return_value.blob.return_value
        store=GcsDocumentsStore('private-test',client)
        store.delete('1/file.pdf',23)
        self.assertEqual(blob.delete.call_args.kwargs['if_generation_match'],23)
        self.assertEqual(blob.delete.call_args.kwargs['timeout'],15)
        store.open('1/file.pdf',23)
        self.assertEqual(client.bucket.return_value.blob.call_args.kwargs,{'generation':23})
        reader=GcsReader(Mock()); reader.reader.read.side_effect=OSError('secret path')
        with self.assertRaises(DocumentError) as error: reader.read(65536)
        self.assertEqual(error.exception.status,503)
        self.assertNotIn('secret',str(error.exception))
