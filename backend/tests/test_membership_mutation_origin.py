"""Origin checks at the real mutation route, independently of storage/auth IO."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import organisation_memberships
from backend.app.auth import get_canonical_user


@pytest.fixture
def setup(monkeypatch):
    allowed = []
    monkeypatch.setattr(
        organisation_memberships, "get_allowed_origins", lambda: allowed
    )
    app = FastAPI()
    app.include_router(organisation_memberships.router)
    app.dependency_overrides[get_canonical_user] = lambda: SimpleNamespace(id=0)
    service = Mock()
    service.create.return_value = {
        "organisation": {"id": "17", "name": "Origin test", "role": 0, "sites": []}
    }
    app.state.organisation_memberships = service
    with TestClient(app, base_url="http://backend.internal:8000") as client:
        yield client, service, allowed


@pytest.mark.parametrize(
    "host,origin,extra",
    [
        ("localhost:3000", "http://localhost:3000", {}),
        ("127.0.0.1:8000", "http://127.0.0.1:8000", {}),
        ("[::1]:3000", "http://[::1]:3000", {}),
        ("app.example.com", "http://app.example.com", {}),
        ("app.example.com", "https://app.example.com", {}),
        ("APP.EXAMPLE.COM:443", "https://app.example.com", {}),
        ("app.example.com", "https://app.example.com:443", {}),
        (
            "public-proxy.example.test:8443",
            "https://public-proxy.example.test:8443",
            {},
        ),
        (
            "example-workspace-3000.app.github.dev",
            "https://example-workspace-3000.app.github.dev",
            {
                "X-Forwarded-Proto": "https",
                "X-Forwarded-Host": "example-workspace-3000.app.github.dev",
            },
        ),
        (
            "portal-example-ew.a.run.app",
            "https://portal-example-ew.a.run.app",
            {"X-Forwarded-Proto": "https"},
        ),
    ],
)
def test_incoming_public_host_is_allowed_without_configuration(
    setup, host, origin, extra
):
    client, service, allowed = setup
    assert allowed == []
    response = client.post(
        "/api/portal/organisations",
        headers={
            "Host": host,
            "Origin": origin,
            "X-Requested-With": "camOS",
            "Sec-Fetch-Site": "same-origin",
            **extra,
        },
        json={"name": "Origin test"},
    )
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    service.create.assert_called_once_with(0, "Origin test")


def test_https_transport_same_origin(setup):
    client, service, _ = setup
    response = client.post(
        "https://app.example.com/api/portal/organisations",
        headers={"Origin": "https://app.example.com", "X-Requested-With": "camOS"},
        json={"name": "Origin test"},
    )
    assert response.status_code == 201
    service.create.assert_called_once()


def test_explicit_cross_origin_configuration_still_allows_intended_request(setup):
    client, service, allowed = setup
    allowed.append("https://FRONTEND.example.test:443/")
    response = client.post(
        "/api/portal/organisations",
        headers={
            "Origin": "https://frontend.example.test",
            "X-Requested-With": "camOS",
            "Sec-Fetch-Site": "same-site",
        },
        json={"name": "Origin test"},
    )
    assert response.status_code == 201
    service.create.assert_called_once()


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        "https://app.example.com.evil.example",
        "https://app.example.com:8443",
        "https://app.example.com:0",
        "null",
        "ftp://app.example.com",
        "https://secret@app.example.com",
        "https://app.example.com/path",
        "https://app.example.com?token=secret",
        "https://app.example.com#secret",
        "https://app.example.com:99999",
        "https://app.example.com https://evil.example",
    ],
)
def test_foreign_or_invalid_origin_rejected_before_service(setup, caplog, origin):
    client, service, _ = setup
    response = client.post(
        "/api/portal/organisations",
        headers={
            "Host": "app.example.com",
            "Origin": origin,
            "X-Requested-With": "camOS",
        },
        json={"name": "Origin test"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "untrusted_origin"
    assert response.headers["cache-control"] == "no-store"
    assert "reason=origin_host_mismatch" in caplog.text
    service.create.assert_not_called()


def test_raw_forwarded_headers_cannot_authorise_a_foreign_origin(setup):
    client, service, _ = setup
    response = client.post(
        "/api/portal/organisations",
        headers={
            "Host": "app.example.com",
            "Origin": "https://evil.example",
            "X-Requested-With": "camOS",
            "X-Forwarded-Host": "evil.example",
            "X-Forwarded-Proto": "https",
            "Forwarded": "host=evil.example;proto=https",
        },
        json={"name": "Origin test"},
    )
    assert response.status_code == 403
    service.create.assert_not_called()


@pytest.mark.parametrize("configured", [False, True])
def test_cross_site_fetch_rejected_even_with_matching_host_or_config(
    setup, caplog, configured
):
    client, service, allowed = setup
    origin = (
        "https://frontend.example.test" if configured else "https://app.example.com"
    )
    if configured:
        allowed.append(origin)
    response = client.post(
        "/api/portal/organisations",
        headers={
            "Host": "app.example.com",
            "Origin": origin,
            "X-Requested-With": "camOS",
            "Sec-Fetch-Site": "cross-site",
        },
        json={"name": "Origin test"},
    )
    assert response.status_code == 403
    assert "reason=sec_fetch_site_cross_site" in caplog.text
    service.create.assert_not_called()


@pytest.mark.parametrize("marker", [None, "", "camos", "XMLHttpRequest"])
def test_missing_or_incorrect_marker_rejected(setup, caplog, marker):
    client, service, _ = setup
    headers = {"Host": "app.example.com", "Origin": "https://app.example.com"}
    if marker is not None:
        headers["X-Requested-With"] = marker
    response = client.post(
        "/api/portal/organisations", headers=headers, json={"name": "Origin test"}
    )
    assert response.status_code == 403
    assert "reason=missing_or_incorrect_mutation_marker" in caplog.text
    service.create.assert_not_called()


def test_non_browser_request_without_origin_still_requires_marker(setup):
    client, service, _ = setup
    response = client.post(
        "/api/portal/organisations",
        headers={"X-Requested-With": "camOS"},
        json={"name": "Origin test"},
    )
    assert response.status_code == 201
    service.create.assert_called_once()


def test_https_transport_does_not_accept_downgraded_origin(setup):
    client, service, _ = setup
    response = client.post(
        "https://app.example.com/api/portal/organisations",
        headers={"Origin": "http://app.example.com", "X-Requested-With": "camOS"},
        json={"name": "Origin test"},
    )
    assert response.status_code == 403
    service.create.assert_not_called()


def test_rejection_logging_excludes_credentials_and_request_content(setup, caplog):
    client, _, _ = setup
    client.cookies.set("camos_session", "session-secret-for-log-test")
    response = client.post(
        "/api/portal/organisations?token=query-secret-for-log-test",
        headers={
            "Host": "app.example.com",
            "Origin": "https://evil.example",
            "X-Requested-With": "camOS",
            "Authorization": "Bearer auth-secret-for-log-test",
        },
        json={"name": "body-secret-for-log-test"},
    )
    assert response.status_code == 403
    assert "origin=('https', 'evil.example', 443)" in caplog.text
    assert "host=('https', 'app.example.com', 443)" in caplog.text
    assert "secret-for-log-test" not in caplog.text


def test_multiple_origin_headers_are_rejected(setup):
    client, service, allowed = setup
    allowed.append("https://app.example.com")
    response = client.post(
        "/api/portal/organisations",
        headers=[
            ("Host", "app.example.com"),
            ("Origin", "https://app.example.com"),
            ("Origin", "https://evil.example"),
            ("X-Requested-With", "camOS"),
        ],
        json={"name": "Origin test"},
    )
    assert response.status_code == 403
    service.create.assert_not_called()
