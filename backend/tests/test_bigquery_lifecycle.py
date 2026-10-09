"""Offline characterization of the BigQuery resource and health boundary."""

from types import SimpleNamespace

import pytest

from backend.app.services.bigquery_client import BigQueryClient


class Rows(list):
    # The base uses a DataFrame only to count rows. No pandas test dependency.
    def to_dataframe(self, **kwargs):
        return self


def test_health_keeps_connectivity_query_and_location(monkeypatch):
    reader = BigQueryClient()
    reader.settings.location = 'europe-west2'
    calls = []
    job = SimpleNamespace(result=lambda **kw: Rows([{'ok': 1}]))
    client = SimpleNamespace(query=lambda sql, **kw: calls.append((sql, kw)) or job)
    monkeypatch.setattr(reader, '_ensure_client', lambda: client)
    reader.run_health_check()
    assert calls[0][0] == 'SELECT 1 AS ok'
    assert calls[0][1]['location'] == 'europe-west2'


def test_health_failure_retains_original_exception(monkeypatch):
    reader = BigQueryClient()
    error = RuntimeError('isolated provider failure')
    def fail(*args, **kwargs):
        raise error
    monkeypatch.setattr(reader, '_ensure_client', fail)
    with pytest.raises(RuntimeError) as caught:
        reader.run_health_check()
    assert caught.value is error


def test_failed_initialization_is_retryable_and_close_is_lazy(monkeypatch):
    reader = BigQueryClient()
    calls = []
    closed = []
    client = SimpleNamespace(close=lambda: closed.append(True))
    def construct(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise RuntimeError('isolated initialization failure')
        return client
    monkeypatch.setattr('backend.app.services.bigquery_client.bigquery.Client', construct)
    reader.close()
    assert not calls
    with pytest.raises(RuntimeError):
        reader._ensure_client()
    assert reader._ensure_client() is client
    assert reader._ensure_client() is client
    reader.close()
    assert len(calls) == 2 and closed == [True]
    assert calls[0] == calls[1]


def test_startup_health_failure_is_nonfatal(monkeypatch):
    import asyncio
    from backend.app.app_factory import create_app
    from backend.app.services.bigquery_client import bigquery_client
    monkeypatch.setattr('backend.app.app_factory.ANALYTICS_OFFLINE_MODE', False)
    def fail():
        raise RuntimeError('isolated health failure')
    monkeypatch.setattr(bigquery_client, 'run_health_check', fail)
    app = create_app()
    # Invoke only the health hook; never production lifecycle/database startup.
    health = next(h for h in app.router.on_startup if h.__name__ == 'startup_health_check')
    asyncio.run(health())
    app.router.on_shutdown[0]()
