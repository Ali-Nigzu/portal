from __future__ import annotations

from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.fastapi_app import app


@pytest.fixture
def login_client(monkeypatch) -> TestClient:
    monkeypatch.setattr("backend.fastapi_app.verify_password", lambda plain, stored: plain == stored)
    monkeypatch.setattr("backend.fastapi_app.save_users", lambda users: None)
    return TestClient(app)


def test_login_response_includes_org_id(login_client: TestClient, monkeypatch):
    fake_users = {
        "client1": {
            "password": "secret",
            "role": "client",
            "name": "Client 1",
            "table_name": "example.demo_data.clientA",
        }
    }
    monkeypatch.setattr("backend.fastapi_app.load_users", lambda: fake_users)

    response = login_client.post("/api/login", json={"username": "client1", "password": "secret"})

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["orgId"] == "demo_data.clientA"
    assert body["user"]["org_id"] == "demo_data.clientA"


def test_login_defaults_admin_to_clientA_org(login_client: TestClient, monkeypatch):
    fake_users = {
        "admin": {
            "password": "admin123",
            "role": "admin",
            "name": "System Admin",
        }
    }
    monkeypatch.setattr("backend.fastapi_app.load_users", lambda: fake_users)

    response = login_client.post("/api/login", json={"username": "admin", "password": "admin123"})

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["orgId"] == "clientA"
    assert body["user"]["org_id"] == "clientA"
