"""Explicit development-only authenticated backend for the zero-Site account."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from argon2 import PasswordHasher

from .canonical_auth import CanonicalUser, Membership
from .organisation_dashboard import (
    EntityNotFound,
    build_zero_organisation_snapshot,
    entity_id,
    slug,
)
from .portal_alarms import AlarmLogs
from .portal_devices import PortalDevices
from .portal_events import EventLogs
from .portal_reports import ReportSnapshotNotFound
from .zero_snapshot import build_zero_scope_snapshot

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "local_new_account.json"
OWNER_ROLE = 0


class ExternalAccessForbidden:
    """Fail loudly if a zero-Site local request unexpectedly reaches storage."""

    def connection(self):
        raise AssertionError("Local new-account mode must not access Cloud SQL")

    def portal_rows(self, *_args, **_kwargs):
        raise AssertionError("Local new-account mode must not access BigQuery")


def _positive_id(value, label):
    try:
        return int(entity_id(value))
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"Invalid local fixture {label}") from exc


class LocalNewAccountFixture:
    def __init__(self, path=FIXTURE_PATH):
        try:
            value = json.loads(Path(path).read_text(encoding="utf-8"))
            user = value["user"]
            login = value["login"]
            organisations = value["organisations"]
            if set(value) != {"user", "login", "organisations"}:
                raise ValueError()
            if len(organisations) != 1 or organisations[0].get("sites") != []:
                raise ValueError()
            organisation = organisations[0]
            membership = organisation["membership"]
            if (
                user.get("username") != "test"
                or not isinstance(login.get("password"), str)
                or not login["password"]
                or user.get("status") != 1
                or organisation.get("enabled") is not True
                or membership.get("enabled") is not True
                or membership.get("role") != OWNER_ROLE
            ):
                raise ValueError()
            self.user_id = _positive_id(user["id"], "user id")
            self.organisation_id = _positive_id(organisation["id"], "organisation id")
            self.login_identifier = user["username"]
            self.display_name = str(user["name"])
            self.email = str(user["email"])
            self.phone = user.get("phone")
            self.password_hash = PasswordHasher().hash(login["password"])
            self.organisation_name = str(organisation["name"])
            self.role = int(membership["role"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError("Invalid local new-account fixture") from exc


class LocalAuthRepository:
    def __init__(self, fixture):
        self.fixture = fixture
        self.user = CanonicalUser(
            fixture.user_id, fixture.email, fixture.display_name,
            fixture.phone, fixture.password_hash, 1,
        )

    def find_user(self, identifier):
        accepted = {self.fixture.login_identifier.casefold(), self.fixture.email.casefold()}
        return self.user if identifier.casefold() in accepted else None

    def get_enabled_user(self, user_id):
        return self.user if user_id == self.fixture.user_id else None

    def organisations(self, user_id):
        if user_id != self.fixture.user_id:
            return []
        return [{
            "id": entity_id(self.fixture.organisation_id),
            "name": self.fixture.organisation_name,
            "role": self.fixture.role,
            "sites": [],
        }]

    def enabled_membership(self, user_id, organisation_id):
        if user_id == self.fixture.user_id and organisation_id == self.fixture.organisation_id:
            return Membership(organisation_id, self.fixture.role)
        return None


class LocalOrganisationDashboard:
    def __init__(self, fixture):
        self.fixture = fixture

    def load_organisation_context(self, organisation_id):
        if organisation_id != self.fixture.organisation_id:
            raise EntityNotFound()
        return {
            "organisation": {
                "id": entity_id(organisation_id),
                "name": self.fixture.organisation_name,
                "enabled": True,
                "slug": slug(self.fixture.organisation_name),
                "realtime": False,
            },
            "sites": [],
        }

    def load_organisation_snapshot(self, organisation_id, *, zero_scope=None):
        context = self.load_organisation_context(organisation_id)
        if zero_scope is not None:
            return build_zero_scope_snapshot(zero_scope)
        organisation = context["organisation"]
        return build_zero_organisation_snapshot(organisation["id"], organisation["name"])

    def load_site_snapshot(self, organisation_id, site_id, *, zero_scope=None):
        self.load_organisation_context(organisation_id)
        raise EntityNotFound()


class LocalPortalMetadata:
    def __init__(self, dashboard):
        self.dashboard = dashboard

    def load(self, identity):
        context = self.dashboard.load_organisation_context(identity.organisation_id)
        now = datetime.now(timezone.utc).isoformat()
        context.update({
            "sources": [],
            "clock": {
                "server_now": now,
                "effective_now": now,
                "time_zone": identity.time_zone,
            },
        })
        return context, {}


class LocalReports:
    def read_snapshot(self, scope, *, allow_empty=False):
        if allow_empty:
            return {"scope": scope.dto, "snapshot": build_zero_scope_snapshot(scope)}
        raise ReportSnapshotNotFound()


class LocalNewAccountServices:
    def __init__(self, fixture_path=FIXTURE_PATH):
        fixture = LocalNewAccountFixture(fixture_path)
        forbidden = ExternalAccessForbidden()
        self.auth_repository = LocalAuthRepository(fixture)
        self.organisation_dashboard = LocalOrganisationDashboard(fixture)
        self.portal_metadata = LocalPortalMetadata(self.organisation_dashboard)
        self.portal_events = EventLogs(forbidden)
        self.portal_alarms = AlarmLogs(forbidden)
        self.portal_devices = PortalDevices(forbidden, forbidden)
        self.portal_reports = LocalReports()

    def close(self):
        return None
