"""Real PG/Admin API, strict row contract, session isolation and Owner disable."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
from decimal import Decimal
import json
from uuid import uuid4
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.tests.admin_postgres import database
from backend.app.api import admin, auth, authenticated_portal, organisation_memberships
from backend.app.services.admin_registry import (
    TABLES,
    AdminError,
    decode,
    table,
    json_text,
)
from backend.app.services.admin_repository import AdminRepository
from backend.app.services.admin_auth import create_admin_session, verify_admin_session
from backend.app.services.session_tokens import (
    create_session,
    verify_session_claims,
    InvalidSession,
)
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.organisation_memberships import OrganisationMemberships
from backend.app.services.organisation_membership_repository import (
    OrganisationMembershipRepository,
)
from backend.app.services.user_lifecycle import UserLifecycle
from backend.app.services.user_lifecycle_repository import UserLifecycleRepository
from backend.app.services.passwords import hash_password

STAMP = "2026-10-08T12:34:56.123456+01:00"


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("PORTAL_SESSION_SECRET", "isolated-admin-tests-secret-" * 3)
    monkeypatch.setenv("PORTAL_SESSION_SECURE", "false")
    db = database()
    h = hash_password("test-only-admin-password")
    db.query(
        "INSERT INTO public.users(id,email,username,password_hash,status,created_at) VALUES(999999,%s,%s,%s,1,now())",
        ("admin@test.invalid", "test-admin", h),
    )
    db.query("UPDATE public.users SET password_hash=%s WHERE id IN(0,1)", (h,))
    app = FastAPI()
    app.state.auth_repository = CanonicalAuthRepository(db.database)
    app.state.admin_repository = AdminRepository(db.database)
    app.state.organisation_memberships = OrganisationMemberships(
        OrganisationMembershipRepository(db.database)
    )
    app.state.user_lifecycle = UserLifecycle(UserLifecycleRepository(db.database))
    for r in (
        admin.router,
        auth.router,
        authenticated_portal.router,
        organisation_memberships.router,
    ):
        app.include_router(r)
    api = TestClient(
        app, headers={"X-Requested-With": "camOS", "Origin": "http://testserver"}
    )
    yield api, db, app
    db.close()


def login(api, username="test-admin"):
    response = api.post(
        "/api/admin/login",
        json={"username": username, "password": "test-only-admin-password"},
    )
    assert response.status_code == 200, response.text
    return api.cookies.get("camos_admin_session")


def create(api, t, data, status=201):
    r = api.post(f"/api/admin/tables/{t}/rows", json={"values": data})
    assert r.status_code == status, r.text
    return r.json()


def topology(api):
    org = create(api, "organisations", {"name": "Test"})
    site = create(
        api,
        "sites",
        {"name": "Site", "organisation_id": org["id"], "max_capacity": 100},
    )
    device = create(
        api,
        "devices",
        {"name": "Camera", "site_id": site["id"], "analysis_interval_minutes": 15},
    )
    gateway = create(
        api,
        "gateways",
        {
            "gateway_id": str(uuid4()),
            "site_id": site["id"],
            "commission_hash": "\\x00ff80",
        },
    )
    return org, site, device, gateway


def test_auth_and_customer_boundary(setup):
    api, db, _ = setup
    assert (
        api.post(
            "/api/admin/login", json={"username": "test-admin", "password": "wrong"}
        ).status_code
        == 401
    )
    assert (
        api.post(
            "/api/admin/login",
            json={"username": "owner", "password": "test-only-admin-password"},
        ).status_code
        == 401
    )
    assert (
        api.post(
            "/api/admin/login",
            json={
                "username": "admin@test.invalid",
                "password": "test-only-admin-password",
            },
        ).status_code
        == 401
    )
    token = login(api)
    assert api.get("/api/admin/me").status_code == 200
    assert api.get("/api/me").status_code == 401
    assert (
        api.post(
            "/api/login",
            json={"identifier": "test-admin", "password": "test-only-admin-password"},
        ).status_code
        == 401
    )
    api.cookies.set("camos_session", token)
    assert api.get("/api/me").status_code == 401
    api.cookies.clear()
    ordinary = create_session(0)[0]
    api.cookies.set("camos_admin_session", ordinary)
    assert api.get("/api/admin/me").status_code == 401
    api.cookies.set("camos_session", create_session(999999)[0])
    assert api.get("/api/me").status_code == 401
    api.cookies.clear()
    login(api)
    db.query("UPDATE public.users SET session_version=1 WHERE id=999999")
    assert api.get("/api/admin/me").status_code == 401
    login(api)
    db.query("UPDATE public.users SET status=0 WHERE id=999999")
    assert api.get("/api/admin/me").status_code == 401
    assert (
        api.post(
            "/api/admin/login",
            json={"username": "test-admin", "password": "test-only-admin-password"},
        ).status_code
        == 401
    )


def test_expiry_purpose_and_logout(setup):
    api, _, _ = setup
    t, _ = create_admin_session(999999, 0, now=100)
    assert verify_admin_session(t, now=100) == (999999, 0)
    with pytest.raises(InvalidSession):
        verify_admin_session(t, now=100 + 8 * 3600)
    with pytest.raises(InvalidSession):
        verify_session_claims(t, now=100)
    login(api)
    customer = create_session(0)[0]
    api.cookies.set("camos_session", customer)
    assert api.post("/api/admin/logout", json={}).status_code == 204
    assert api.cookies.get("camos_session") == customer
    assert api.get("/api/me").status_code == 200
    login(api)
    assert api.post("/api/logout", json={}).status_code == 204
    assert api.get("/api/admin/me").status_code == 200


def test_reset_reserved_excluded(setup, monkeypatch):
    api, db, _ = setup
    from backend.app.services import postmark_email

    sent = []
    monkeypatch.setattr(
        postmark_email, "send_password_reset_code_email", lambda **kw: sent.append(kw)
    )
    response = api.post(
        "/api/password-reset/start", json={"email": "admin@test.invalid"}
    )
    assert response.status_code == 202, response.text
    assert sent == []
    assert db.query("SELECT count(*) FROM public.user_lifecycle_challenges")[0][0] == 0


@pytest.mark.parametrize(
    "path",
    [
        "/api/admin/users",
        "/api/admin/device-list",
        "/api/admin/alarm-logs",
        "/api/admin/data-sources/client1",
        "/api/admin/create-view-token",
        "/api/admin/sql",
    ],
)
def test_old_routes_absent(setup, path):
    api, _, _ = setup
    login(api)
    assert api.get(path).status_code == 404
    assert api.post(path, json={}).status_code == 404


def test_allowlist_schema_immutability_and_origin(setup):
    api, _, _ = setup
    login(api)
    assert {t["name"] for t in api.get("/api/admin/tables").json()["tables"]} == set(
        TABLES
    )
    for name in ("pg_authid", "users;DROP TABLE users", "anything"):
        assert api.get("/api/admin/tables/" + name + "/rows").status_code == 404
    for data in (
        {"name": "X", "type": "text"},
        {"name": "X", "ALTER TABLE": "x"},
        {"id": "999999", "name": "X"},
    ):
        create(api, "organisations", data, 422)
    r = api.post(
        "/api/admin/tables/organisations/rows",
        json={"values": {"name": "X"}, "schema": {}},
    )
    assert r.status_code == 422
    r = api.post(
        "/api/admin/tables/organisations/rows",
        json={"values": {"name": "X"}},
        headers={"Origin": "https://evil.invalid"},
    )
    assert r.status_code == 403
    assert r.headers["cache-control"] == "no-store"
    api.headers.pop("X-Requested-With")
    assert api.post("/api/admin/logout", json={}).status_code == 403
    api.cookies.clear()
    assert (
        api.get(
            "/api/admin/tables", headers={"Authorization": "Basic YWRtaW46YWRtaW4xMjM="}
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    "table_name,column,value",
    [
        ("sites", "max_capacity", True),
        ("sites", "max_capacity", "12"),
        ("sites", "max_capacity", 32768),
        ("devices", "analysis_interval_minutes", 1.5),
        ("devices", "analysis_interval_minutes", 0),
        ("organisations", "enabled", 1),
        ("organisations", "enabled", "false"),
        ("users", "session_version", "-1"),
        ("users", "id", 9007199254740993),
        ("users", "id", "01"),
        ("users", "id", "9223372036854775808"),
        ("gateways", "gateway_id", "invalid"),
        ("gateways", "desired_state", 3),
        ("gateways", "commission_hash", "\\x0"),
        ("users", "created_at", "2026-10-08T12:00:00"),
        ("users", "username", None),
        ("memberships", "role", 2),
        ("user_lifecycle_challenges", "attempts", -1),
        ("user_lifecycle_challenges", "purpose", 3),
    ],
)
def test_strict_values(table_name, column, value):
    with pytest.raises(AdminError):
        decode(TABLES[table_name].fields[column], value)


def test_all_ten_tables_round_trip_and_constraints(setup):
    api, db, _ = setup
    login(api)
    org, site, device, gateway = topology(api)
    assert device["rtsp_username"] == "" and device["analyzed_until"] is None
    assert device["capture_fps"] == 3 and device["frame_package_interval_minutes"] == 15
    assert gateway["commission_hash"] == "\\x00ff80"
    user = create(
        api,
        "users",
        {
            "email": "raw@test.invalid",
            "username": "raw",
            "phone_number": "",
            "password_hash": "raw-hash-not-plaintext",
            "status": 1,
            "created_at": STAMP,
        },
    )
    assert (
        user["phone_number"] == ""
        and user["created_at"] == "2026-10-08T11:34:56.123456+00:00"
    )
    m = create(
        api,
        "memberships",
        {
            "user_id": user["id"],
            "organisation_id": org["id"],
            "role": 1,
            "status": 2,
            "created_at": STAMP,
            "status_changed_at": STAMP,
        },
    )
    for t, key in [
        ("organisation_snapshots", "organisation_id"),
        ("site_snapshots", "site_id"),
    ]:
        entity = org["id"] if key == "organisation_id" else site["id"]
        snapshot = create(
            api,
            t,
            {
                key: entity,
                "ts": STAMP,
                "payload": {"entrances_96": [1, 2, 3]},
                "state": None,
                "updated_at": STAMP,
            },
        )
        assert snapshot["state"] is None
        assert db.query(f"SELECT state IS NULL,jsonb_typeof(state) FROM public.{t}")[
            0
        ] == [False, "null"]
        create(
            api,
            t,
            {key: entity, "ts": STAMP, "payload": {}, "state": {}, "updated_at": STAMP},
            409,
        )
    alarm = create(
        api,
        "alarms",
        {
            "organisation_id": org["id"],
            "site_id": site["id"],
            "device_id": device["id"],
            "alarm_type": "test",
            "severity": "low",
            "started_at": STAMP,
        },
    )
    challenge = create(
        api,
        "user_lifecycle_challenges",
        {
            "id": "raw-challenge",
            "purpose": 1,
            "user_id": user["id"],
            "code_hash": "opaque",
            "code_expires_at": STAMP,
            "payload": {"large": 9007199254740993},
        },
    )
    rows = {
        "organisations": org,
        "sites": site,
        "devices": device,
        "gateways": gateway,
        "users": user,
        "memberships": m,
        "organisation_snapshots": {"organisation_id": org["id"]},
        "site_snapshots": {"site_id": site["id"]},
        "alarms": alarm,
        "user_lifecycle_challenges": challenge,
    }
    changes = {
        "organisations": {"name": "Updated"},
        "sites": {"max_capacity": 0},
        "devices": {"enabled": False, "line_ax": 0},
        "gateways": {"reported_version": "2.0"},
        "users": {"phone_number": None},
        "memberships": {"status": 1},
        "organisation_snapshots": {"payload": [1, 2]},
        "site_snapshots": {"state": False},
        "alarms": {"severity": "high"},
        "user_lifecycle_challenges": {"attempts": 1},
    }
    for t, source in rows.items():
        key = {k: source[k] for k in TABLES[t].pk}
        r = api.put(
            f"/api/admin/tables/{t}/row", json={"key": key, "changes": changes[t]}
        )
        assert r.status_code == 200, r.text
        assert all(r.json()[k] == v for k, v in changes[t].items())
        assert api.get(f"/api/admin/tables/{t}/row", params=key).status_code == 200
        assert (
            api.put(
                f"/api/admin/tables/{t}/row",
                json={"key": key, "changes": {TABLES[t].pk[0]: key[TABLES[t].pk[0]]}},
            ).status_code
            == 422
        )
    for data in (
        {"email": "RAW@TEST.INVALID", "username": "different"},
        {"email": "different@test.invalid", "username": "RAW"},
    ):
        create(
            api,
            "users",
            {**data, "password_hash": "h", "status": 1, "created_at": STAMP},
            409,
        )
    create(
        api,
        "sites",
        {"name": "Site", "organisation_id": org["id"], "max_capacity": 10},
        409,
    )
    create(
        api,
        "devices",
        {"name": "Camera", "site_id": site["id"], "analysis_interval_minutes": 15},
        409,
    )
    create(api, "gateways", {"gateway_id": str(uuid4()), "site_id": site["id"]}, 409)
    create(
        api,
        "gateways",
        {"gateway_id": str(uuid4()), "commission_hash": "\\x00ff80"},
        409,
    )
    create(
        api,
        "sites",
        {"name": "Bad", "organisation_id": "987654", "max_capacity": 10},
        422,
    )
    create(
        api,
        "memberships",
        {
            "user_id": "0",
            "organisation_id": org["id"],
            "role": 1,
            "status": 3,
            "created_at": STAMP,
            "status_changed_at": None,
        },
        422,
    )
    for more in (
        {"gateway_id": gateway["gateway_id"]},
        {"device_id": None},
        {"cleared_at": "2026-01-01T00:00:00Z"},
    ):
        create(
            api,
            "alarms",
            {
                "organisation_id": org["id"],
                "site_id": site["id"],
                "device_id": device["id"],
                "alarm_type": "test",
                "severity": "low",
                "started_at": STAMP,
                **more,
            },
            422,
        )
    create(api, "gateways", {"gateway_id": str(uuid4()), "desired_version": ""}, 422)
    assert (
        api.put(
            "/api/admin/tables/site_snapshots/row",
            json={"key": {"site_id": "123456"}, "changes": {"state": {}}},
        ).status_code
        == 404
    )
    assert (
        api.get("/api/admin/tables/alarms/rows").headers["cache-control"] == "no-store"
    )


def test_lossless_json_and_bigint_pagination(setup):
    api, db, _ = setup
    login(api)
    db.query(
        "INSERT INTO public.users(id,email,username,password_hash,status,created_at) VALUES(9007199254740993,%s,%s,%s,1,now())",
        ("big@test.invalid", "big", "hash"),
    )
    assert (
        api.get(
            "/api/admin/tables/users/row", params={"id": "9007199254740993"}
        ).json()["id"]
        == "9007199254740993"
    )
    payload = (
        '{"values":{"organisation_id":"1","ts":"'
        + STAMP
        + '","payload":{"number":12345678901234567890.1234567890123456789},"state":null,"updated_at":"'
        + STAMP
        + '"}}'
    )
    r = api.post(
        "/api/admin/tables/organisation_snapshots/rows",
        content=payload,
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 201, r.text
    assert "12345678901234567890.1234567890123456789" in r.text
    assert (
        db.query("SELECT payload->>'number' FROM public.organisation_snapshots")[0][0]
        == "12345678901234567890.1234567890123456789"
    )
    seen = []
    cursor = None
    while True:
        params = {"page_size": 2}
        if cursor:
            params["cursor"] = cursor
        data = api.get("/api/admin/tables/users/rows", params=params).json()
        seen.extend(r["id"] for r in data["items"])
        cursor = data["next_cursor"]
        if not cursor:
            break
    assert len(seen) == len(set(seen)) and "9007199254740993" in seen and "0" in seen
    assert (
        api.get("/api/admin/tables/users/rows", params={"page_size": 101}).status_code
        == 422
    )
    assert (
        api.get("/api/admin/tables/users/rows", params={"cursor": "bad"}).status_code
        == 422
    )


def test_context_soft_disable_and_reenable(setup):
    api, db, _ = setup
    login(api)
    org, site, device, gateway = topology(api)
    create(
        api,
        "memberships",
        {
            "user_id": "0",
            "organisation_id": org["id"],
            "role": 0,
            "status": 1,
            "created_at": STAMP,
        },
    )
    create(
        api,
        "memberships",
        {
            "user_id": "1",
            "organisation_id": org["id"],
            "role": 1,
            "status": 1,
            "created_at": STAMP,
        },
    )
    context = api.get(f'/api/admin/organisations/{org["id"]}/context').json()
    assert not context["snapshot_exists"]
    assert context["sites"][0]["device_count"] == "1"
    assert context["sites"][0]["gateway_id"] == gateway["gateway_id"]
    assert (
        not context["sites"][0]["snapshot_exists"] and len(context["memberships"]) == 2
    )
    create(
        api,
        "site_snapshots",
        {
            "site_id": site["id"],
            "ts": STAMP,
            "payload": {},
            "state": {},
            "updated_at": STAMP,
        },
    )
    assert api.get(f'/api/admin/organisations/{org["id"]}/context').json()["sites"][0][
        "snapshot_exists"
    ]
    before = {
        t: db.query(f"SELECT * FROM public.{t}")
        for t in (
            "sites",
            "devices",
            "gateways",
            "memberships",
            "site_snapshots",
            "alarms",
        )
    }
    api.cookies.set("camos_session", create_session(1)[0])
    path = f'/api/portal/organisations/{org["id"]}/disable'
    assert api.post(path, json={}).status_code == 403
    api.cookies.set("camos_session", create_session(0)[0])
    assert api.post(path, json={}).status_code == 200
    assert all(
        db.query(f"SELECT * FROM public.{t}") == rows for t, rows in before.items()
    )
    assert org["id"] not in [
        o["id"] for o in api.get("/api/portal/organisations").json()["organisations"]
    ]
    assert api.get(f'/api/portal/organisations/{org["id"]}/context').status_code == 404
    db.query("UPDATE public.organisations SET enabled=FALSE WHERE id=1")
    assert api.get("/api/portal/organisations").json()["organisations"] == []
    assert api.get("/api/me").status_code == 200
    assert (
        api.put(
            "/api/admin/tables/organisations/row",
            json={"key": {"id": org["id"]}, "changes": {"enabled": True}},
        ).status_code
        == 200
    )
    assert org["id"] in [
        o["id"] for o in api.get("/api/portal/organisations").json()["organisations"]
    ]


def test_credentials_edit_and_reserved_allocation(setup):
    api, db, _ = setup
    login(api)
    r = api.put(
        "/api/admin/tables/users/row",
        json={
            "key": {"id": "999999"},
            "changes": {
                "username": "updated-admin",
                "password_hash": hash_password("changed-test-password"),
            },
        },
    )
    assert r.status_code == 200
    assert (
        api.post(
            "/api/admin/login",
            json={"username": "test-admin", "password": "test-only-admin-password"},
        ).status_code
        == 401
    )
    assert (
        api.post(
            "/api/admin/login",
            json={"username": "updated-admin", "password": "changed-test-password"},
        ).status_code
        == 200
    )
    create(
        api,
        "users",
        {
            "id": "999999",
            "email": "x@x.invalid",
            "username": "x",
            "status": 1,
            "password_hash": "h",
            "created_at": STAMP,
        },
        422,
    )
    # Even absent reserved row cannot be bootstrapped by ordinary generated creation.
    db.query("DELETE FROM public.users WHERE id=999999")
    db.query("SELECT setval('public.users_id_seq',999999,false)")
    with pytest.raises(AdminError) as exc:
        AdminRepository(db.database).mutate(
            "users",
            {
                "email": "new@x.invalid",
                "username": "new",
                "status": 1,
                "password_hash": "h",
                "created_at": STAMP,
            },
        )
    assert exc.value.status == 409
    assert not db.query("SELECT id FROM public.users WHERE id=999999")


def test_existing_reserved_reset_challenge_cannot_complete(setup):
    api, db, app = setup
    from backend.app.services.user_lifecycle import digest, RESET
    from backend.app.services.user_lifecycle_repository import LifecycleError

    handle = "pre-existing-reserved-reset"
    db.query(
        "INSERT INTO public.user_lifecycle_challenges(id,purpose,user_id,code_hash,code_expires_at,verified_at) VALUES(%s,1,999999,'hash',now()+interval '10 minutes',now())",
        (digest(handle),),
    )
    before = db.query(
        "SELECT password_hash,session_version FROM public.users WHERE id=999999"
    )
    with pytest.raises(LifecycleError):
        app.state.user_lifecycle.reset_password(
            handle, "new-password123", "new-password123"
        )
    assert (
        db.query(
            "SELECT password_hash,session_version FROM public.users WHERE id=999999"
        )
        == before
    )
    with pytest.raises(LifecycleError):
        app.state.user_lifecycle.resend(RESET, handle)


def test_constraint_errors_json_null_and_filter_binding(setup):
    api, db, _ = setup
    login(api)
    org, site, device, _ = topology(api)
    create(
        api,
        "organisation_snapshots",
        {
            "organisation_id": org["id"],
            "ts": STAMP,
            "payload": {"$sql_null": True},
            "state": None,
            "updated_at": STAMP,
        },
    )
    assert db.query("SELECT payload FROM public.organisation_snapshots")[0][0] == {
        "$sql_null": True
    }
    for fields in (
        {"severity": "invalid"},
        {"started_at": None},
        {"site_id": "456789"},
    ):
        create(
            api,
            "alarms",
            {
                "organisation_id": org["id"],
                "site_id": site["id"],
                "device_id": device["id"],
                "alarm_type": "test",
                "severity": "low",
                "started_at": STAMP,
                **fields,
            },
            422,
        )
    create(
        api,
        "user_lifecycle_challenges",
        {
            "id": "bad",
            "purpose": 1,
            "code_hash": "hash",
            "code_expires_at": STAMP,
            "resends": -1,
        },
        422,
    )
    create(
        api,
        "devices",
        {
            "name": "Invalid interval",
            "site_id": site["id"],
            "analysis_interval_minutes": 1,
            "frame_package_interval_minutes": 0,
        },
        422,
    )
    create(api, "gateways", {"gateway_id": str(uuid4()), "reported_version": ""}, 422)
    create(
        api,
        "sites",
        {"name": "Site", "organisation_id": org["id"], "max_capacity": 10},
        409,
    )
    other = create(
        api,
        "sites",
        {"name": "Other", "organisation_id": org["id"], "max_capacity": 10},
    )
    cursor = api.get(
        "/api/admin/tables/sites/rows",
        params={"organisation_id": org["id"], "page_size": 1},
    ).json()["next_cursor"]
    assert cursor
    assert (
        api.get(
            "/api/admin/tables/sites/rows",
            params={"organisation_id": "1", "cursor": cursor},
        ).status_code
        == 422
    )
    context = api.get(
        f'/api/admin/organisations/{org["id"]}/context', params={"page_size": 1}
    ).json()
    assert len(context["sites"]) == 1 and context["next_cursor"]
    assert (
        api.get(
            f'/api/admin/organisations/{org["id"]}/context',
            params={"page_size": 1, "cursor": context["next_cursor"]},
        ).json()["sites"][0]["id"]
        == other["id"]
    )
    assert (
        api.post(
            "/api/admin/tables/organisations/rows",
            content='{"values":{"name":"one","name":"two"}}',
        ).status_code
        == 422
    )


def test_membership_revocation_serialises_before_disable(setup):
    api, db, app = setup
    from threading import Event

    repo = app.state.admin_repository
    org = repo.mutate("organisations", {"name": "Concurrent"})
    repo.mutate(
        "memberships",
        {
            "user_id": "0",
            "organisation_id": org["id"],
            "role": 0,
            "status": 1,
            "created_at": STAMP,
        },
    )
    started = Event()

    def disable():
        started.set()
        return app.state.organisation_memberships.disable(0, org["id"])

    from backend.app.services.organisation_memberships import MembershipError

    with ThreadPoolExecutor(max_workers=1) as pool:
        with db.database.transaction() as con, closing(con.cursor()) as cur:
            repo.lock(cur, int(org["id"]))
            future = pool.submit(disable)
            assert started.wait(2)
            cur.execute(
                "UPDATE public.memberships SET role=1 WHERE user_id=0 AND organisation_id=%s",
                (int(org["id"]),),
            )
        with pytest.raises(MembershipError) as error:
            future.result(timeout=5)
        assert error.value.status == 403
    assert repo.get("organisations", {"id": org["id"]})["enabled"] is True


def test_restricted_row_role_needs_no_schema_rights(setup):
    from contextlib import contextmanager

    _, db, app = setup
    role = "admin_row_test_" + uuid4().hex
    db.query(f'CREATE ROLE "{role}"')
    names = ",".join("public." + name for name in TABLES)
    db.query(f'GRANT SELECT,INSERT,UPDATE ON {names} TO "{role}"')
    db.query(
        f'GRANT USAGE ON SEQUENCE public.users_id_seq,public.organisations_id_seq,public.sites_id_seq,public.devices_id_seq,public.alarms_id_seq TO "{role}"'
    )

    class Limited:
        @contextmanager
        def transaction(self):
            with db.database.transaction() as con:
                with closing(con.cursor()) as cur:
                    cur.execute(f'SET LOCAL ROLE "{role}"')
                yield con

        connection = transaction

    try:
        repo = AdminRepository(Limited())
        org = repo.mutate("organisations", {"name": "Limited"})
        site = repo.mutate(
            "sites",
            {"name": "Limited Site", "organisation_id": org["id"], "max_capacity": 5},
        )
        repo.mutate(
            "devices",
            {
                "name": "Limited Device",
                "site_id": site["id"],
                "analysis_interval_minutes": 15,
            },
        )
        repo.mutate("organisations", {"enabled": False}, {"id": org["id"]})
        assert repo.context(org["id"])["organisation"]["enabled"] is False
        assert len(repo.list("devices")["items"]) == 1
        for sql in (
            "ALTER TABLE public.users ADD COLUMN forbidden integer",
            "DELETE FROM public.users",
            "CREATE TABLE public.forbidden(id integer)",
        ):
            with pytest.raises(Exception):
                with Limited().transaction() as con, closing(con.cursor()) as cur:
                    cur.execute(sql)
    finally:
        db.query(f'DROP OWNED BY "{role}"')
        db.query(f'DROP ROLE "{role}"')


@pytest.mark.parametrize("site_scope", [False, True])
def test_customer_snapshot_resolution_and_raw_admin_json(
    setup, monkeypatch, site_scope
):
    from backend.app.services.organisation_dashboard import OrganisationDashboard
    from backend.app.services.portal_context import PortalMetadata
    from backend.app.services.zero_snapshot import build_zero_snapshot

    api, db, app = setup
    login(api)
    org, site, _, _ = topology(api)
    create(
        api,
        "memberships",
        {
            "user_id": "0",
            "organisation_id": org["id"],
            "role": 0,
            "status": 1,
            "created_at": STAMP,
        },
    )
    app.state.organisation_dashboard = OrganisationDashboard(db.database)
    app.state.portal_metadata = PortalMetadata(
        db.database, app.state.organisation_dashboard
    )
    api.cookies.set("camos_session", create_session(0)[0])
    path = f'/api/portal/organisations/{org["id"]}/' + (
        f'sites/{site["id"]}/snapshot' if site_scope else "snapshot"
    )
    t = "site_snapshots" if site_scope else "organisation_snapshots"
    key = {"site_id": site["id"]} if site_scope else {"organisation_id": org["id"]}
    scope = "site" if site_scope else "organisation"
    missing = api.get(path)
    assert missing.status_code == 200, missing.text
    assert missing.json()["payload"]["entrances_96"] == [0] * 96
    usable = build_zero_snapshot(
        scope, next(iter(key.values())), "Selected", datetime.now(timezone.utc)
    )["payload"]
    usable["entrances_96"][95] = 17
    create(
        api,
        t,
        {**key, "ts": STAMP, "payload": usable, "state": {}, "updated_at": STAMP},
    )
    original_zero = app.state.organisation_dashboard._zero_snapshot

    def forbidden_zero(*args):
        raise AssertionError("Valid persisted snapshot lost precedence")

    monkeypatch.setattr(
        app.state.organisation_dashboard, "_zero_snapshot", forbidden_zero
    )
    persisted = api.get(path)
    assert persisted.status_code == 200, persisted.text
    assert persisted.json()["payload"]["entrances_96"][95] == 17
    usable["entrances_96"][95] = 29
    update = api.put(
        f"/api/admin/tables/{t}/row",
        json={
            "key": key,
            "changes": {"payload": usable, "ts": "2026-10-09T13:14:15.654321Z"},
        },
    )
    assert update.status_code == 200
    assert api.get(path).json()["payload"]["entrances_96"][95] == 29
    assert api.get(path).json()["ts"] == "2026-10-09T13:14:15.654321+00:00"
    monkeypatch.setattr(
        app.state.organisation_dashboard, "_zero_snapshot", original_zero
    )
    for raw in ({}, [], {"test": 1}, None):
        update = api.put(
            f"/api/admin/tables/{t}/row",
            json={"key": key, "changes": {"payload": raw, "state": raw}},
        )
        assert update.status_code == 200 and update.json()["payload"] == raw
        before = db.query(f"SELECT * FROM public.{t}")
        fallback = api.get(path)
        assert fallback.status_code == 200, fallback.text
        assert fallback.json()["payload"]["entrances_96"] == [0] * 96
        assert db.query(f"SELECT * FROM public.{t}") == before


def test_admin_server_now_create_update_and_existing_modes(setup, monkeypatch):
    import backend.app.services.admin_registry as registry_module

    fixed = datetime(2031, 2, 3, 4, 5, 6, 123456, tzinfo=timezone.utc)

    class ServerClock(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz is timezone.utc
            return fixed

    monkeypatch.setattr(registry_module, "datetime", ServerClock)
    api, db, _ = setup
    login(api)
    r = api.post(
        "/api/admin/tables/organisation_snapshots/rows",
        json={
            "values": {"organisation_id": "1", "payload": {}, "state": None},
            "server_now": ["ts", "updated_at"],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["ts"] == r.json()["updated_at"] == fixed.isoformat()
    assert db.query("SELECT ts,updated_at FROM public.organisation_snapshots")[0] == [
        fixed,
        fixed,
    ]
    fixed = fixed.replace(day=4)
    r = api.put(
        "/api/admin/tables/organisation_snapshots/row",
        json={
            "key": {"organisation_id": "1"},
            "changes": {},
            "server_now": ["updated_at"],
        },
    )
    assert r.status_code == 200 and r.json()["updated_at"] == fixed.isoformat()
    assert r.json()["ts"] != r.json()["updated_at"]
    r = api.put(
        "/api/admin/tables/organisation_snapshots/row",
        json={
            "key": {"organisation_id": "1"},
            "changes": {"ts": "2026-10-08T15:42:10.123456Z"},
        },
    )
    assert r.status_code == 200 and r.json()["ts"] == "2026-10-08T15:42:10.123456+00:00"
    assert r.json()["updated_at"] == fixed.isoformat()
    r = api.put(
        "/api/admin/tables/organisation_snapshots/row",
        json={
            "key": {"organisation_id": "1"},
            "changes": {"ts": "2026-10-08T15:42:10"},
        },
    )
    assert r.status_code == 422
    org, site, device, _ = topology(api)
    r = api.put(
        "/api/admin/tables/devices/row",
        json={
            "key": {"id": device["id"]},
            "changes": {},
            "server_now": ["last_seen_at"],
        },
    )
    assert r.status_code == 422  # Unknown name: no inference from similar timestamps.
    r = api.put(
        "/api/admin/tables/devices/row",
        json={
            "key": {"id": device["id"]},
            "changes": {},
            "server_now": ["analyzed_until"],
        },
    )
    assert r.status_code == 200 and r.json()["analyzed_until"] == fixed.isoformat()
    r = api.put(
        "/api/admin/tables/devices/row",
        json={"key": {"id": device["id"]}, "changes": {"analyzed_until": None}},
    )
    assert r.status_code == 200 and r.json()["analyzed_until"] is None
    # Omitted/default organisation timestamp is DB-owned, not our frozen Now clock.
    assert org["created_at"] != fixed.isoformat()


@pytest.mark.parametrize(
    "table_name,column",
    [
        ("organisations", "name"),
        ("sites", "organisation_id"),
        ("devices", "analysis_interval_minutes"),
        ("devices", "capture_fps"),
        ("organisations", "enabled"),
        ("alarms", "gateway_id"),
        ("site_snapshots", "payload"),
        ("gateways", "commission_hash"),
    ],
)
def test_server_now_rejected_for_every_other_type(setup, table_name, column):
    api, _, _ = setup
    login(api)
    key = {name: "1" for name in TABLES[table_name].pk}
    if "gateway_id" in key:
        key["gateway_id"] = str(uuid4())
    r = api.put(
        f"/api/admin/tables/{table_name}/row",
        json={"key": key, "changes": {}, "server_now": [column]},
    )
    assert r.status_code == 422, r.text


@pytest.mark.parametrize(
    "intent",
    [
        {"server_now": None},
        {"server_now": "updated_at"},
        {"server_now": [{}]},
        {"server_now": ["updated_at", "updated_at"]},
        {"server_now": ["unknown"]},
        {"server_now": ["id"]},
        {"server_now": ["updated_at"], "changes": {"updated_at": STAMP}},
        {"server_now": ["updated_at"], "type": "text"},
    ],
)
def test_invalid_server_now_intents_and_metadata_rejected(setup, intent):
    api, _, _ = setup
    login(api)
    r = api.put(
        "/api/admin/tables/organisations/row",
        json={"key": {"id": "1"}, "changes": {}, **intent},
    )
    assert r.status_code == 422, r.text


def test_now_is_generic_and_raw_values_are_not_tokens():
    from backend.app.services.admin_registry import values

    for t in TABLES.values():
        for col in t.columns:
            if col.type == "timestamptz" and col.name not in t.pk:
                result = values(t, {}, server_now=[col.name])
                assert result[col.name].tzinfo is timezone.utc
    assert values(TABLES["organisations"], {"name": "now"})["name"] == "now"
    raw = {"$admin_value": "now"}
    assert (
        json.loads(values(TABLES["site_snapshots"], {"payload": raw})["payload"]) == raw
    )
