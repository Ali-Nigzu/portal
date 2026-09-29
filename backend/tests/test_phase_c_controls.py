from contextlib import contextmanager
import pytest

from backend.app.services.portal_context import PortalIdentity
from backend.app.services.portal_devices import (
    InvalidGatewayState, PortalDevices, SourceNotFound,
    gateway_desired_state_for_enabled,
)


class DB:
    def __init__(self, *, device=True, gateway_state=2):
        self.device = device
        self.gateway_state = gateway_state
        self.calls = []

    @contextmanager
    def connection(self):
        yield self

    def cursor(self): return self
    def close(self): pass
    def execute(self, sql, params=()):
        self.sql, self.params = sql, params
        self.calls.append((sql, params))
    def fetchone(self):
        if "UPDATE public.devices" in self.sql:
            return (7, 11, self.params[0]) if self.device else None
        if "UPDATE public.gateways" in self.sql:
            if self.gateway_state == 0:
                return None
            self.gateway_state = self.params[0]
            return (11, self.gateway_state)
        return None


class BQ: pass


def scope(site=None):
    return type("Scope", (), {
        "identity": PortalIdentity(1), "site_id": site,
    })()


@pytest.mark.parametrize("enabled", [False, True])
def test_device_writer_uses_canonical_boolean_and_organisation_join(enabled):
    db = DB()
    result = PortalDevices(db, BQ()).set_device_enabled(scope(), "7", enabled)
    sql, params = db.calls[0]
    assert "UPDATE public.devices" in sql and "s.organisation_id = %s" in sql
    assert params == (enabled, 7, 1)
    assert result["source"]["canonical_enabled"] is enabled


@pytest.mark.parametrize("enabled,state", [(False, 1), (True, 2)])
def test_gateway_writer_maps_only_one_and_two(enabled, state):
    db = DB(gateway_state=2 if not enabled else 1)
    result = PortalDevices(db, BQ()).set_gateway_enabled(scope("11"), "11", enabled)
    sql, params = db.calls[0]
    assert "g.desired_state IN (1, 2)" in sql and "%s IN (1, 2)" in sql
    assert params[0] == state and params[3] == state
    assert 0 not in params
    assert result["source"]["canonical_enabled"] is enabled


def test_gateway_zero_cannot_be_promoted_or_generated():
    assert gateway_desired_state_for_enabled(False) == 1
    assert gateway_desired_state_for_enabled(True) == 2
    for invalid in (0, 1, 2, None, "true"):
        with pytest.raises(InvalidGatewayState):
            gateway_desired_state_for_enabled(invalid)
    db = DB(gateway_state=0)
    with pytest.raises(SourceNotFound):
        PortalDevices(db, BQ()).set_gateway_enabled(scope(), "11", True)
    assert db.calls[0][1][0] == 2
