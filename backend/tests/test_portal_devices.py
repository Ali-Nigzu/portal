from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import portal
from backend.app.services.portal_context import PortalIdentity, PortalScope
from backend.app.services.portal_devices import PortalDevices
from backend.app.services.portal_devices import InvalidGatewayState, gateway_enabled

NOW = datetime(2026, 9, 20, 12, tzinfo=timezone.utc)


class Metadata:
    def load(self, identity):
        return ({
            "organisation": {"id": str(identity.organisation_id)},
            "sites": [{"id": "11", "name": "Alis Barber"}, {"id": "22", "name": "Tokis Takeout"}],
            "sources": [
                {"ref": "device:101", "kind": "device", "site_id": "11", "label": "Front Door", "analyzed_until": NOW.isoformat()},
                {"ref": "gateway:11", "kind": "gateway", "site_id": "11", "label": "Gateway 11", "analyzed_until": None},
                {"ref": "device:202", "kind": "device", "site_id": "22", "label": "Front Door", "analyzed_until": NOW.isoformat()},
            ],
        }, {"gateway:11": "private-gateway-uuid"})


class DB:
    def __init__(self, gateway_state=2): self.calls = []; self.gateway_state = gateway_state
    @contextmanager
    def connection(self): yield self
    def cursor(self): return self
    def close(self): pass
    def execute(self, sql, params=()): self.sql = sql; self.params = params; self.calls.append((sql, params))
    def fetchall(self):
        if "public.devices" in self.sql:
            rows = [(101, 11, "Front Door", True, NOW - timedelta(minutes=5)), (202, 22, "Front Door", False, None)]
        else:
            rows = [("private-gateway-uuid", 11, self.gateway_state)]
        if "site_id = %s" in self.sql: rows = [row for row in rows if row[1] == int(self.params[-1])]
        return rows


class BQ:
    def __init__(self, fail=False): self.calls = []; self.fail = fail
    def portal_rows(self, sql, params, limit):
        self.calls.append((sql, params, limit))
        if self.fail: raise RuntimeError("warehouse unavailable")
        return [{"site_id": 11, "device_id": 101, "record_count": 7}, {"site_id": 11, "device_id": 999, "record_count": 3}]


def make_scope(site=None):
    return PortalScope.resolve(PortalIdentity(1, NOW), Metadata(), site)


def test_device_projection_is_scoped_and_uses_one_grouped_query():
    db, bq = DB(), BQ()
    result = PortalDevices(db, bq).read(make_scope())
    assert [item["ref"] for item in result["items"]] == ["device:101", "device:202", "gateway:11"]
    assert [item["canonical_enabled"] for item in result["items"]] == [True, False, True]
    assert result["items"][0]["freshness"] == "fresh"
    assert result["items"][1]["freshness"] == "unknown"
    assert result["items"][2]["freshness"] == "unavailable"
    assert result["items"][0]["records"] == 7
    assert result["items"][2]["records"] == 10
    assert "private-gateway-uuid" not in str(result)
    gateway_sql = next(sql for sql, _ in db.calls if "public.gateways" in sql)
    assert "g.desired_state" in gateway_sql and "g.enabled" not in gateway_sql
    assert len(bq.calls) == 1 and "GROUP BY site_id, device_id" in bq.calls[0][0]
    assert bq.calls[0][1] == {"org": 1, "cutoff": NOW}


def test_device_projection_site_scope_and_partial_records_failure():
    db, bq = DB(), BQ(fail=True)
    result = PortalDevices(db, bq).read(make_scope("11"))
    assert {item["site_id"] for item in result["items"]} == {"11"}
    assert result["records_status"] == "unavailable"
    assert all(item["records"] is None for item in result["items"])
    assert bq.calls[0][1]["site"] == 11
    assert all(params == (1, 11) for _, params in db.calls)


@pytest.mark.parametrize("desired_state,enabled", [(1, False), (2, True)])
def test_gateway_desired_state_maps_explicitly(desired_state, enabled):
    result = PortalDevices(DB(desired_state), BQ()).read(make_scope("11"))
    gateway = next(item for item in result["items"] if item["kind"] == "gateway")
    assert gateway["canonical_enabled"] is enabled
    assert "desired_state" not in gateway and "private-gateway-uuid" not in str(result)


def test_gateway_desired_state_zero_is_valid_but_omitted():
    result = PortalDevices(DB(0), BQ()).read(make_scope("11"))
    assert [item["ref"] for item in result["items"]] == ["device:101"]
    assert result["items"][0]["canonical_enabled"] is True
    assert result["records_status"] == "available"

    app = FastAPI()
    app.include_router(portal.router)
    app.state.portal_metadata = Metadata()
    app.state.portal_devices = PortalDevices(DB(0), BQ())
    response = TestClient(app).get("/api/demo/portal/devices?site_id=11")
    assert response.status_code == 200
    assert [item["ref"] for item in response.json()["items"]] == ["device:101"]


@pytest.mark.parametrize("desired_state", [None, 3, -1, True, False, "2", 2.0])
def test_gateway_desired_state_rejects_invalid_persisted_values(desired_state):
    with pytest.raises(InvalidGatewayState):
        gateway_enabled(desired_state)


def test_demo_devices_is_get_only():
    app = FastAPI()
    app.include_router(portal.router)
    app.state.portal_metadata = Metadata()
    app.state.portal_devices = PortalDevices(DB(), BQ())
    api = TestClient(app)
    response = api.get("/api/demo/portal/devices")
    assert response.status_code == 200 and response.json()["scope"]["organisation_id"] == "1"
    for method in (api.post, api.put, api.patch, api.delete):
        assert method("/api/demo/portal/devices").status_code == 405
