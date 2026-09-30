from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import authenticated_portal
from backend.app.services.canonical_auth import CanonicalUser, Membership
from backend.app.services.session_tokens import create_session


class Repository:
    enabled = True
    organisation_enabled = True

    def get_enabled_user(self, user_id):
        if user_id == 0 and self.enabled:
            return CanonicalUser(0, "user@example.com", "user", None, "not-exposed", 1)
        return None

    def organisations(self, user_id):
        return [{"id": "1", "name": "Demo", "role": 0, "sites": [
            {"id": "11", "name": "Alis Barber"}
        ]}] if self.organisation_enabled else []

    def enabled_membership(self, user_id, organisation_id):
        if user_id == 0 and organisation_id == 1 and self.organisation_enabled:
            return Membership(1, 0)
        return None


class Metadata:
    def load(self, identity):
        return ({
            "organisation": {"id": "1", "name": "Demo", "slug": "demo", "enabled": True, "realtime": True},
            "sites": [{"id": "11", "name": "Alis Barber", "slug": "alis-barber", "organisation_id": "1", "enabled": True, "realtime": True, "max_capacity": 10}],
            "sources": [],
            "clock": {"server_now": "2026-09-29T00:00:00+00:00", "effective_now": "2026-09-29T00:00:00+00:00", "time_zone": "Europe/London"},
        }, {})


class Devices:
    def __init__(self): self.calls = []
    def set_gateway_enabled(self, scope, site, enabled):
        self.calls.append((scope.identity.organisation_id, site, enabled))
        return {"scope": {"organisation_id": "1", "site_id": site}, "source": {"ref": f"gateway:{site}", "kind": "gateway", "canonical_enabled": enabled}}
    def read(self, scope):
        return {"scope": scope.dto, "records_status": "available", "items": []}


class Dashboard:
    def load_organisation_snapshot(self, organisation):
        return {"scope": "organisation", "entity_id": str(organisation), "entity_name": "Demo", "ts": "2026-09-29T00:00:00+00:00", "payload": {}}
    def load_site_snapshot(self, organisation, site):
        return {"scope": "site", "entity_id": str(site), "entity_name": "Alis Barber", "ts": "2026-09-29T00:00:00+00:00", "payload": {}}


class Events:
    def search(self, scope, filters, cursor=None, page_size=20):
        return {"scope": scope.dto, "items": [], "total": 0, "page": {"next_cursor": None}}


class Alarms:
    def search(self, scope, filters, cursor=None):
        return {"scope": scope.dto, "active": {"items": []}, "cleared": {"items": []}}


class Reports:
    def read_snapshot(self, scope):
        return {"scope": scope.dto, "snapshot": {}}


def client(monkeypatch):
    monkeypatch.setenv("PORTAL_SESSION_SECRET", "c" * 64)
    app = FastAPI()
    repo, devices = Repository(), Devices()
    app.state.auth_repository = repo
    app.state.portal_metadata = Metadata()
    app.state.portal_devices = devices
    app.state.organisation_dashboard = Dashboard()
    app.state.portal_events = Events()
    app.state.portal_alarms = Alarms()
    app.state.portal_reports = Reports()
    app.include_router(authenticated_portal.router)
    api = TestClient(app)
    token, _ = create_session(0)
    api.cookies.set("camos_session", token)
    return api, repo, devices


def test_enabled_organisations_and_live_membership_disable(monkeypatch):
    api, repo, _ = client(monkeypatch)
    assert api.get("/api/portal/organisations").json() == {
        "organisations": [{"id": "1", "name": "Demo", "role": 0, "sites": [
            {"id": "11", "name": "Alis Barber"}
        ]}]
    }
    assert api.get("/api/portal/organisations/1/context").status_code == 200
    repo.organisation_enabled = False
    assert api.get("/api/portal/organisations").json() == {"organisations": []}
    assert api.get("/api/portal/organisations/1/context").status_code == 404


def test_gateway_api_accepts_boolean_and_rejects_state_zero(monkeypatch):
    api, _, devices = client(monkeypatch)
    path = "/api/portal/organisations/1/gateways/by-site/11/enabled"
    assert api.put(path, json={"enabled": False}).status_code == 200
    assert devices.calls == [(1, "11", False)]
    assert api.put(path, json={"desired_state": 0}).status_code == 422
    assert api.put(path, json={"enabled": 0}).status_code == 422


def test_all_shared_module_routes_are_available_in_authorised_scope(monkeypatch):
    api, _, _ = client(monkeypatch)
    base = "/api/portal/organisations/1"
    for path in (
        "/snapshot", "/sites/11/snapshot", "/devices", "/events",
        "/alarms", "/reports/snapshot",
    ):
        response = api.get(base + path)
        assert response.status_code == 200, (path, response.text)
    assert api.get("/api/portal/organisations/2/events").status_code == 404
    assert api.get(base + "/events?site_id=999").status_code == 404
