"""API and SQL integration tests against isolated real PostgreSQL databases."""

import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, contextmanager
from threading import Barrier

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import authenticated_portal, organisation_memberships
from backend.app.services.canonical_auth import CanonicalAuthRepository
from backend.app.services.organisation_membership_repository import (
    OrganisationMembershipRepository,
)
from backend.app.services.organisation_memberships import (
    MembershipError,
    OrganisationMemberships,
)
from backend.app.services.session_tokens import create_session
from backend.tests.membership_postgres import LocalPostgres
from backend.tests.test_authenticated_portal import (
    Alarms,
    Dashboard,
    Devices,
    Events,
    Metadata,
    Reports,
)


@pytest.fixture
def postgres():
    if not os.getenv("PORTAL_TEST_POSTGRES_PORT"):
        pytest.skip(
            "Requires disposable localhost PostgreSQL; see docs/self-service-organisations.md"
        )
    pg = LocalPostgres()
    try:
        pg.migrate()
        yield pg
    finally:
        pg.close()


@pytest.fixture
def setup(postgres, monkeypatch):
    monkeypatch.setenv("PORTAL_SESSION_SECRET", "membership-tests-only-" * 3)
    app = FastAPI()
    repository = OrganisationMembershipRepository(postgres.database)
    service = OrganisationMemberships(repository)
    app.state.auth_repository = CanonicalAuthRepository(postgres.database)
    app.state.organisation_memberships = service
    app.state.portal_metadata = Metadata()
    app.state.organisation_dashboard = Dashboard()
    app.state.portal_devices = Devices()
    app.state.portal_events = Events()
    app.state.portal_alarms = Alarms()
    app.state.portal_reports = Reports()
    app.include_router(authenticated_portal.router)
    app.include_router(organisation_memberships.router)
    client = TestClient(app, headers={"X-Requested-With": "camOS"})

    def login(actor):
        token, _ = create_session(actor)
        client.cookies.set("camos_session", token)

    login(0)
    return client, service, repository, login


def invite(client, identifier="member@example.com", kind="email", organisation="1"):
    return client.post(
        f"/api/portal/organisations/{organisation}/invitations",
        json={"identifier_type": kind, "identifier": identifier},
    )


def decision(client, path, row):
    return client.post(
        path, json={"expected_status_changed_at": row["status_changed_at"]}
    )


def test_create_postgres_identity_atomic_owner_and_zero_sites(postgres, setup):
    client, _, _, login = setup
    login(1)
    assert client.get("/api/portal/organisations").json() == {"organisations": []}
    postgres.query(
        "ALTER SEQUENCE public.organisations_id_seq RESTART WITH 900000000000000101"
    )
    response = client.post("/api/portal/organisations", json={"name": "  New Org  "})
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    org = response.json()["organisation"]
    assert org == {
        "id": "900000000000000101",
        "name": "New Org",
        "role": 0,
        "sites": [],
    }
    row = postgres.query(
        "SELECT role,status,created_at,status_changed_at FROM public.memberships WHERE user_id=1"
    )[0]
    assert row[:2] == [0, 1] and row[2] and row[3]
    assert client.get("/api/portal/organisations").json()["organisations"] == [org]
    assert (
        client.post("/api/portal/organisations", json={"name": "New Org"}).status_code
        == 201
    )


def test_creation_rollback_and_read_autocommit_after_exception(
    postgres, setup, monkeypatch
):
    client, _, repository, _ = setup
    monkeypatch.setattr(
        repository,
        "insert",
        lambda *args: (_ for _ in ()).throw(RuntimeError("forced failure")),
    )
    assert (
        client.post(
            "/api/portal/organisations", json={"name": "Must Roll Back"}
        ).status_code
        == 503
    )
    assert postgres.query("SELECT name FROM public.organisations") == [["Demo"]]
    with postgres.database.connection() as connection:
        assert connection.driver_connection.autocommit is True


@pytest.mark.parametrize(
    "kind,identifier,target",
    [
        ("email", "MEMBER@EXAMPLE.COM", "1"),
        ("username", "MEMBER", "1"),
        ("username", "MEMBER@EXAMPLE.COM", "4"),
    ],
)
def test_exact_lookup_invitation_and_idempotence(
    postgres, setup, kind, identifier, target
):
    client, _, _, _ = setup
    response = invite(client, identifier, kind)
    assert response.status_code == 201
    row = response.json()["membership"]
    assert (row["user_id"], row["role"], row["status"]) == (target, 1, 2)
    duplicate = invite(client, identifier, kind)
    assert duplicate.status_code == 200 and duplicate.json()["membership"] == row
    assert postgres.query(
        "SELECT count(*) FROM public.memberships WHERE user_id=%s", (int(target),)
    ) == [[1]]


@pytest.mark.parametrize(
    "identifier,status,code",
    [
        ("unknown@example.com", 404, "invite_target_unavailable"),
        ("disabled@example.com", 409, "invite_target_disabled"),
        ("owner@example.com", 409, "self_invite"),
    ],
)
def test_rejected_invites_do_not_write(postgres, setup, identifier, status, code):
    client, _, _, _ = setup
    response = invite(client, identifier)
    assert response.status_code == status and response.json()["detail"]["error"] == code
    assert postgres.query("SELECT count(*) FROM public.users") == [[5]]
    assert postgres.query("SELECT count(*) FROM public.memberships") == [[1]]


@pytest.mark.parametrize("action,status", [("accept", 1), ("decline", 0)])
def test_invitation_decision_and_personal_pending(postgres, setup, action, status):
    client, _, _, login = setup
    row = invite(client).json()["membership"]
    login(1)
    pending = client.get("/api/portal/me/memberships/pending").json()
    assert pending["invitations"][0]["organisation_name"] == "Demo"
    assert client.get("/api/portal/organisations/1/context").status_code == 404
    assert client.get("/api/portal/organisations").json()["organisations"] == []
    path = f"/api/portal/me/invitations/1/{action}"
    response = decision(client, path, row)
    assert (
        response.status_code == 200
        and response.json()["membership"]["status"] == status
    )
    assert response.json()["membership"]["role"] == 1
    assert decision(client, path, row).status_code == 200
    assert client.get("/api/portal/me/memberships/pending").json()["invitations"] == []
    assert bool(client.get("/api/portal/organisations").json()["organisations"]) == (
        status == 1
    )


@pytest.mark.parametrize("action,status", [("approve", 1), ("decline", 0)])
def test_request_confirmation_creation_and_owner_decision(
    postgres, setup, action, status
):
    client, _, _, login = setup
    login(1)
    resolved = client.get("/api/portal/organisation-access/1").json()
    assert resolved == {
        "organisation": {"id": "1", "name": "Demo"},
        "relationship": None,
        "can_request": True,
    }
    response = client.post("/api/portal/organisation-access/1/requests", json={})
    row = response.json()["membership"]
    assert response.status_code == 201 and row["role"] == 1 and row["status"] == 3
    assert (
        client.post("/api/portal/organisation-access/1/requests", json={}).json()[
            "membership"
        ]
        == row
    )
    assert (
        client.get("/api/portal/me/memberships/pending").json()["requests"][0][
            "organisation_id"
        ]
        == "1"
    )
    login(0)
    assert (
        client.get("/api/portal/organisations/1/access").json()["requests"][0][
            "username"
        ]
        == "member"
    )
    path = f"/api/portal/organisations/1/requests/1/{action}"
    response = decision(client, path, row)
    assert (
        response.status_code == 200
        and response.json()["membership"]["status"] == status
    )
    assert decision(client, path, row).status_code == 200


def test_disable_reinvite_stale_decision_and_original_created_at(postgres, setup):
    client, _, _, login = setup
    original = invite(client).json()["membership"]
    login(1)
    active = decision(client, "/api/portal/me/invitations/1/accept", original).json()[
        "membership"
    ]
    login(0)
    disabled = decision(client, "/api/portal/organisations/1/members/1/disable", active)
    assert disabled.status_code == 200
    assert (
        decision(
            client, "/api/portal/organisations/1/members/1/disable", active
        ).status_code
        == 200
    )
    replacement = invite(client).json()["membership"]
    assert replacement["created_at"] == original["created_at"]
    assert replacement["status_changed_at"] > original["status_changed_at"]
    login(1)
    assert (
        decision(client, "/api/portal/me/invitations/1/decline", original).json()[
            "detail"
        ]["error"]
        == "stale_state"
    )
    assert (
        decision(client, "/api/portal/me/invitations/1/accept", replacement).status_code
        == 200
    )
    login(0)
    assert (
        decision(
            client, "/api/portal/organisations/1/members/1/disable", active
        ).status_code
        == 409
    )


def test_withdraw_and_disabled_can_request_without_restoring_role(postgres, setup):
    client, _, _, login = setup
    row = invite(client).json()["membership"]
    assert (
        decision(
            client, "/api/portal/organisations/1/invitations/1/withdraw", row
        ).status_code
        == 200
    )
    postgres.query("UPDATE public.memberships SET role=0 WHERE user_id=1")
    login(1)
    row = client.post("/api/portal/organisation-access/1/requests", json={}).json()[
        "membership"
    ]
    assert row["role"] == 1 and row["status"] == 3


def test_pending_conflicts_and_active_conflicts(postgres, setup):
    client, _, _, login = setup
    invited = invite(client).json()["membership"]
    login(1)
    assert (
        client.post("/api/portal/organisation-access/1/requests", json={}).json()[
            "detail"
        ]["error"]
        == "already_invited"
    )
    decision(client, "/api/portal/me/invitations/1/decline", invited)
    requested = client.post(
        "/api/portal/organisation-access/1/requests", json={}
    ).json()["membership"]
    login(0)
    assert invite(client).json()["detail"]["error"] == "already_requested"
    decision(client, "/api/portal/organisations/1/requests/1/approve", requested)
    assert invite(client).json()["detail"]["error"] == "already_active"
    login(1)
    assert (
        client.post("/api/portal/organisation-access/1/requests", json={}).json()[
            "detail"
        ]["error"]
        == "already_active"
    )


def test_owner_authority_member_privacy_cross_org_and_self_disable(postgres, setup):
    client, _, _, login = setup
    assert (
        decision(
            client,
            "/api/portal/organisations/1/members/0/disable",
            {"status_changed_at": None},
        ).json()["detail"]["error"]
        == "self_management_not_supported"
    )
    row = invite(client).json()["membership"]
    login(1)
    assert invite(client, "third@example.com").status_code == 404
    assert (
        decision(
            client, "/api/portal/organisations/1/requests/2/approve", row
        ).status_code
        == 404
    )
    decision(client, "/api/portal/me/invitations/1/accept", row)
    access = client.get("/api/portal/organisations/1/access").json()
    assert (
        access["can_manage"] is False
        and access["members"] == []
        and access["invitations"] == []
    )
    assert invite(client, "third@example.com").status_code == 403
    assert (
        decision(
            client,
            "/api/portal/organisations/1/members/0/disable",
            {"status_changed_at": None},
        ).status_code
        == 403
    )
    assert invite(client, "third@example.com", organisation="2").status_code == 404


@pytest.mark.parametrize("status", [0, 1, 2, 3])
def test_exact_active_predicate_across_protected_resources(postgres, setup, status):
    client, _, _, login = setup
    assert invite(client).status_code == 201
    postgres.query("UPDATE public.memberships SET status=%s WHERE user_id=1", (status,))
    login(1)
    base = "/api/portal/organisations/1"
    for path in (
        "/context",
        "/snapshot",
        "/sites/11/snapshot",
        "/devices",
        "/events",
        "/alarms",
        "/reports/snapshot",
    ):
        assert client.get(base + path).status_code == (200 if status == 1 else 404), (
            path
        )
    for path in ("/devices/11/enabled", "/gateways/by-site/11/enabled"):
        if status != 1:
            assert client.put(base + path, json={"enabled": False}).status_code == 404
    if status != 1:
        assert client.get(base + "/events/export").status_code == 404
    assert bool(client.get("/api/portal/organisations").json()["organisations"]) == (
        status == 1
    )


def test_disabled_organisation_and_invalid_ids(postgres, setup):
    client, _, _, _ = setup
    postgres.query("UPDATE public.organisations SET enabled=false WHERE id=1")
    for path in (
        "/api/portal/organisation-access/1",
        "/api/portal/organisations/1/access",
        "/api/portal/organisations/1/context",
    ):
        assert client.get(path).status_code == 404
    assert invite(client).status_code == 404
    for value in ("0", "-1", "1.5", "9223372036854775808", "abc"):
        assert client.get(f"/api/portal/organisation-access/{value}").status_code == 422
    assert client.get("/api/portal/organisation-access/999").status_code == 404


def test_strict_models_and_origin_no_client_authority(postgres, setup):
    client, _, _, _ = setup
    for extra in ({"role": 0}, {"acting_user_id": "0"}, {"site": "all-sites"}):
        assert (
            client.post(
                "/api/portal/organisations/1/invitations",
                json={
                    "identifier_type": "email",
                    "identifier": "member@example.com",
                    **extra,
                },
            ).status_code
            == 422
        )
    assert (
        client.post("/api/portal/organisations", json={"name": ""}).status_code == 422
    )
    assert (
        client.post("/api/portal/organisations", json={"name": "   "}).status_code
        == 422
    )
    assert (
        client.post("/api/portal/organisations", json={"name": "x" * 201}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/portal/organisations",
            json={"name": "Unsafe"},
            headers={"Origin": "https://evil.invalid"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/portal/organisations",
            json={"name": "Unsafe"},
            headers={"X-Requested-With": ""},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/portal/organisations",
            json={"name": "Safe"},
            headers={"Origin": "http://testserver"},
        ).status_code
        == 201
    )


def test_concurrent_invite_request_and_duplicate_insert(postgres, setup):
    _, service, _, _ = setup
    barrier = Barrier(2)

    def run(invitation):
        barrier.wait()
        try:
            return service.initiate(
                0 if invitation else 1,
                "1",
                **(
                    {"identifier_type": "email", "identifier": "member@example.com"}
                    if invitation
                    else {}
                ),
            )
        except MembershipError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [True, False]))
    assert sum(isinstance(result, tuple) for result in results) == 1
    assert postgres.query(
        "SELECT count(*) FROM public.memberships WHERE user_id=1"
    ) == [[1]]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: service.initiate(2, "1"), range(4)))
    assert sum(created for _, created in results) == 1


def test_concurrent_owners_cannot_disable_each_other(postgres, setup):
    _, service, _, _ = setup
    postgres.query(
        "INSERT INTO public.memberships(user_id,organisation_id,role,status,created_at) VALUES(1,1,0,1,now())"
    )
    barrier = Barrier(2)

    def run(actor):
        barrier.wait()
        try:
            return service.decide(actor, "1", "disable", None, str(1 - actor))["status"]
        except MembershipError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [0, 1]))
    assert results.count(0) == 1
    assert postgres.query(
        "SELECT count(*) FROM public.memberships WHERE role=0 AND status=1"
    ) == [[1]]


def test_migration_preserves_history_rejects_rerun_and_invalid_pending(postgres):
    assert postgres.query(
        "SELECT status_changed_at FROM public.memberships WHERE user_id=0"
    ) == [[None]]
    with pytest.raises(Exception):
        postgres.migrate()
    assert postgres.query(
        "SELECT role,status FROM public.memberships WHERE user_id=0"
    ) == [[0, 1]]
    with pytest.raises(Exception):
        postgres.query(
            "UPDATE public.memberships SET status=2,status_changed_at=NULL WHERE user_id=0"
        )
    with pytest.raises(Exception):
        postgres.query("UPDATE public.memberships SET status=4 WHERE user_id=0")


def test_workflows_with_only_documented_runtime_grants(postgres):
    role = postgres.name + "_runtime"
    postgres.query(f'CREATE ROLE "{role}"')
    try:
        postgres.query(f'GRANT SELECT ON public.users TO "{role}"')
        postgres.query(f'GRANT SELECT, INSERT ON public.organisations TO "{role}"')
        postgres.query(
            f'GRANT USAGE ON SEQUENCE public.organisations_id_seq TO "{role}"'
        )
        postgres.query(
            f'GRANT SELECT, INSERT, UPDATE ON public.memberships TO "{role}"'
        )

        class LimitedDatabase:
            @contextmanager
            def transaction(self):
                with postgres.database.transaction() as connection:
                    with closing(connection.cursor()) as cursor:
                        cursor.execute(f'SET LOCAL ROLE "{role}"')
                    yield connection

            connection = transaction

        service = OrganisationMemberships(
            OrganisationMembershipRepository(LimitedDatabase())
        )
        oid = service.create(0, "Least privilege")["organisation"]["id"]
        invited, _ = service.initiate(
            0, oid, identifier_type="username", identifier="member"
        )
        assert service.pending(1)["invitations"][0]["organisation_id"] == oid
        active = service.decide(1, oid, "accept", invited["status_changed_at"])
        assert service.access(0, oid)["can_manage"] is True
        service.decide(0, oid, "disable", active["status_changed_at"], "1")
        request, _ = service.initiate(1, oid)
        assert (
            service.decide(0, oid, "approve", request["status_changed_at"], "1")["role"]
            == 1
        )
    finally:
        postgres.query(f'DROP OWNED BY "{role}"')
        postgres.query(f'DROP ROLE "{role}"')
