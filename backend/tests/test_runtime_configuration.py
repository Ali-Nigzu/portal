"""Construction/lifespan checks need neither HTTPX nor live cloud credentials."""
import os
import unittest
from unittest.mock import patch
import asyncio

from backend.app.app_factory import create_app


class RuntimeConfigurationTests(unittest.TestCase):
    def test_missing_and_short_signing_secret_fail_before_serving(self):
        for secret in ('', 'too-short'):
            with patch.dict(os.environ, {'PORTAL_SESSION_SECRET': secret}):
                with self.assertRaises(RuntimeError): create_app()

    def test_optional_providers_and_shutdown_close_all_resources(self):
        with patch.dict(os.environ, {'PORTAL_SESSION_SECRET': 'test-only-runtime-key-32-characters-minimum',
                                     'GOOGLE_CLIENT_ID':'','GOOGLE_CLIENT_SECRET':'',
                                     'MICROSOFT_CLIENT_ID':'','MICROSOFT_CLIENT_SECRET':''}):
            with patch('backend.app.services.bigquery_client.bigquery_client') as bq, \
                 patch('backend.app.services.dashboard_postgres.DashboardPostgres') as database, \
                 patch('backend.app.app_factory.DashboardPostgres', database), \
                 patch('backend.app.data.gcs_documents_store.GcsDocumentsStore') as storage:
                app=create_app()
                async def lifecycle():
                    with patch.object(app.state.user_lifecycle,'cleanup_expired'):
                        async with app.router.lifespan_context(app): pass
                asyncio.run(lifecycle())
                bq.run_health_check.assert_called_once()
                bq.close.assert_called_once(); database.return_value.close.assert_called_once(); storage.return_value.close.assert_called_once()
