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


def test_simultaneous_first_use_constructs_one_client(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    reader = BigQueryClient()
    start = Barrier(2)
    calls = []
    client = object()
    monkeypatch.setattr('backend.app.services.bigquery_client.bigquery.Client',
                        lambda **kw: calls.append(kw) or client)
    def first_use(_):
        start.wait(timeout=3)
        return reader._ensure_client()
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(first_use, range(2))) == [client, client]
    assert len(calls) == 1


@pytest.mark.parametrize('failures', [(), (0,), (1,), (2,), (0, 1, 2)])
def test_shutdown_attempts_every_close_in_order_and_preserves_first(monkeypatch, failures):
    from backend.app.app_factory import create_app
    from backend.app.services.bigquery_client import bigquery_client
    app = create_app()
    calls = []
    errors = [RuntimeError(f'isolated close {i}') for i in range(3)]
    resources = [app.state.documents_service.store, app.state.auth_repository.database, bigquery_client]
    for index, resource in enumerate(resources):
        def close(index=index):
            calls.append(index)
            if index in failures:
                raise errors[index]
        monkeypatch.setattr(resource, 'close', close)
    if failures:
        with pytest.raises(RuntimeError) as caught:
            app.router.on_shutdown[0]()
        assert caught.value is errors[failures[0]]
    else:
        app.router.on_shutdown[0]()
    assert calls == [0, 1, 2]
