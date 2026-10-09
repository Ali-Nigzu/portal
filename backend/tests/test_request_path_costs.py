"""Read-path ordering, scope and resource boundary characterization."""

from contextlib import contextmanager
from datetime import datetime, timezone

import pytest

from backend.app.services.admin_repository import AdminRepository
from backend.app.services.admin_registry import AdminError
from backend.app.services.organisation_dashboard import EntityNotFound, OrganisationDashboard, site_slugs
from backend.app.services.portal_context import PortalIdentity, PortalMetadata, PortalScope

NOW = datetime(2026, 10, 8, 12, tzinfo=timezone.utc)


class ReadDatabase:
    def __init__(self, missing=False, failure=None):
        self.missing, self.failure = missing, failure
        self.queries, self.checkouts, self.closes = [], 0, 0
        self.active = False

    @contextmanager
    def connection(self):
        self.checkouts += 1
        self.active = True
        try:
            yield self
        finally:
            self.active = False

    def cursor(self):
        return self

    def close(self):
        self.closes += 1

    def execute(self, sql, params):
        self.queries.append((sql, params))
        if len(self.queries) == self.failure:
            raise RuntimeError('isolated read failure')
        self.sql = sql

    def fetchone(self):
        return None if self.missing else (1, 'Organisation', True)

    def fetchall(self):
        if 'SELECT s.id' in self.sql:
            return [(11, 'Café', 1, False, 10, True)]
        if 'SELECT d.id' in self.sql:
            return [(101, 11, 'Door', NOW)]
        return [('private-gateway', 11)]


def metadata(database):
    return PortalMetadata(database, OrganisationDashboard(database))


@pytest.mark.parametrize('cutoff', [None, NOW], ids=['customer', 'demo'])
@pytest.mark.parametrize('site', [None, '11'])
def test_metadata_preserves_four_queries_and_scoped_shapes(cutoff, site):
    database = ReadDatabase()
    scope = PortalScope.resolve(PortalIdentity(1, cutoff), metadata(database), site)
    assert len(database.queries) == 4 and database.closes == 2
    for (sql, _), prefix in zip(database.queries, [
        'SELECT id, name, enabled', 'SELECT s.id, s.name',
        'SELECT d.id, d.site_id', 'SELECT g.gateway_id, g.site_id']):
        assert sql.startswith(prefix)
    assert all(params == (1,) for _, params in database.queries)
    assert scope.context['organisation']['realtime'] is True
    assert scope.context['sites'][0]['enabled'] is False
    assert scope.context['sources'][0]['analyzed_until'] == NOW.isoformat()
    assert scope.gateways == {'gateway:11': 'private-gateway'}
    assert 'private-gateway' not in str(scope.context)
    assert scope.dto == {'organisation_id': '1', 'site_id': site}


def test_missing_organisation_precedes_other_metadata_reads():
    database = ReadDatabase(missing=True)
    with pytest.raises(EntityNotFound):
        metadata(database).load(PortalIdentity(1))
    assert len(database.queries) == 1 and database.closes == 1


@pytest.mark.parametrize('failure', [1, 2, 3, 4])
def test_metadata_failure_stops_at_same_statement_and_closes(failure):
    database = ReadDatabase(failure=failure)
    with pytest.raises(RuntimeError, match='isolated read failure'):
        metadata(database).load(PortalIdentity(1))
    assert len(database.queries) == failure
    assert not database.active


def test_slug_collisions_preserve_order_and_input_identity():
    import hashlib
    sites = [{'name': name} for name in ['Café', 'Cafe', 'Café', 'Other', '!!!']]
    identities = [id(site) for site in sites]
    assert site_slugs(sites) is sites
    assert [id(site) for site in sites] == identities
    assert [site['slug'] for site in sites] == [
        'cafe-' + hashlib.sha256(name.encode()).hexdigest() for name in ['Café', 'Cafe', 'Café']
    ] + ['other', 'unnamed']


class AdminReads(ReadDatabase):
    def __init__(self, count=51):
        super().__init__()
        self.rows = [(i, f'Org {i}', NOW, NOW, True) for i in range(1, count + 1)]

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


def test_admin_read_page_and_missing_row_contract():
    database = AdminReads()
    result = AdminRepository(database).list('organisations', 50)
    assert len(result['items']) == 50 and result['next_cursor']
    assert result['items'][0]['id'] == '1' and result['items'][-1]['id'] == '50'
    assert result['items'][0]['created_at'] == NOW.isoformat()
    with pytest.raises(AdminError) as error:
        AdminRepository(AdminReads(0)).get('organisations', {'id': '99'})
    assert error.value.status == 404 and error.value.message == 'Row not found'
