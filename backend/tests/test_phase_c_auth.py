from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from argon2 import PasswordHasher
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import auth
from backend.app.services.canonical_auth import CanonicalAuthRepository, CanonicalUser, Membership
from backend.app.services.session_tokens import SESSION_SECONDS, create_session, verify_session, InvalidSession


class Repository:
    def __init__(self):
        password_hash = PasswordHasher().hash("1")
        self.users = {
            0: CanonicalUser(0, "cod4dinner@gmail.com", "aligg", None, password_hash, 1),
            1: CanonicalUser(1, "disabled@example.com", "disabled", None, password_hash, 0),
        }

    def find_user(self, identifier):
        matches = [user for user in self.users.values() if identifier.casefold() in {
            user.email.casefold(), user.username.casefold()
        }]
        return matches[0] if len(matches) == 1 else None

    def get_enabled_user(self, user_id):
        user = self.users.get(user_id)
        return user if user and user.status == 1 else None


def client(monkeypatch):
    monkeypatch.setenv("PORTAL_SESSION_SECRET", "a" * 64)
    monkeypatch.delenv("NODE_ENV", raising=False)
    app = FastAPI()
    app.state.auth_repository = Repository()
    app.include_router(auth.router)
    return TestClient(app), app.state.auth_repository


def test_email_and_username_argon_login_issue_one_year_cookie(monkeypatch):
    api, _ = client(monkeypatch)
    for identifier in ("COD4DINNER@GMAIL.COM", "ALIGG"):
        response = api.post("/api/login", json={"identifier": identifier, "password": "1"})
        assert response.status_code == 200
        assert response.json() == {"user": {"id": "0", "name": "aligg", "email": "cod4dinner@gmail.com", "phone": None}}
        assert "password_hash" not in response.text
        cookie = response.headers["set-cookie"].lower()
        assert "max-age=31536000" in cookie and "httponly" in cookie and "samesite=lax" in cookie
        assert api.get("/api/me").status_code == 200


def test_login_failures_are_generic_and_live_disable_invalidates(monkeypatch):
    api, repository = client(monkeypatch)
    failures = [
        {"identifier": "missing", "password": "1"},
        {"identifier": "aligg", "password": "wrong"},
        {"identifier": "disabled", "password": "1"},
    ]
    for payload in failures:
        response = api.post("/api/login", json=payload)
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid identifier or password"
    assert api.post("/api/login", json={"identifier": "aligg", "password": "1"}).status_code == 200
    repository.users[0] = CanonicalUser(**{**repository.users[0].__dict__, "status": 0})
    assert api.get("/api/me").status_code == 401


def test_signed_session_has_absolute_non_sliding_one_year_expiry(monkeypatch):
    monkeypatch.setenv("PORTAL_SESSION_SECRET", "b" * 64)
    token, expires = create_session(0, now=100)
    assert expires == 100 + SESSION_SECONDS
    assert verify_session(token, now=expires - 1) == 0
    try:
        verify_session(token, now=expires)
        assert False, "expired session accepted"
    except InvalidSession:
        pass


@pytest.mark.parametrize("site_id,site_name", [(11, "Alis Barber"), (None, None)])
def test_organisation_catalog_and_membership_require_enabled_organisation(site_id, site_name):
    class Cursor:
        def __init__(self): self.calls = []
        def execute(self, sql, params): self.calls.append((sql, params))
        def fetchall(self): return [(1, "Demo", 0, site_id, site_name)]
        def fetchone(self): return (1, 0)
        def close(self): pass
    class DB:
        def __init__(self): self.cursor_value = Cursor()
        @contextmanager
        def connection(self): yield SimpleNamespace(cursor=lambda: self.cursor_value)
    database = DB()
    repository = CanonicalAuthRepository(database)
    assert repository.organisations(0) == [{
        "id": "1", "name": "Demo", "role": 0,
        "sites": [{"id": "11", "name": "Alis Barber"}] if site_id is not None else [],
    }]
    assert repository.enabled_membership(0, 1) == Membership(1, 0)
    membership_queries = [sql for sql, _ in database.cursor_value.calls if "public.memberships" in sql]
    for sql in membership_queries:
        assert "m.status = 1" in sql and "o.enabled = TRUE" in sql
