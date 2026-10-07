"""Organisation membership rules; identity is always supplied by the session."""

from datetime import datetime

from .organisation_dashboard import entity_id
from .organisation_membership_repository import (
    ACTIVE,
    DISABLED,
    INVITED,
    MEMBER,
    OWNER,
    REQUESTED,
)


class MembershipError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message
        super().__init__(code)


def conflict(code, message):
    raise MembershipError(409, code, message)


def organisation_id(value):
    try:
        return int(entity_id(value))
    except (TypeError, ValueError):
        raise MembershipError(
            422, "invalid_organisation_id", "Enter a valid numeric Organisation ID."
        ) from None


def user_id(value):
    # Canonical user IDs can be zero; organisation identities are positive.
    if (
        not isinstance(value, str)
        or len(value) > 19
        or not value.isascii()
        or not value.isdecimal()
        or str(int(value)) != value
        or int(value) > 9223372036854775807
    ):
        raise MembershipError(422, "invalid_user_id", "Invalid member.")
    return int(value)


class OrganisationMemberships:
    def __init__(self, repository):
        self.repository = repository
        self.database = repository.database

    def _actor(self, connection, actor):
        if not self.repository.enabled_user(connection, actor):
            raise MembershipError(401, "unauthenticated", "Please sign in again.")

    def _organisation(self, connection, oid):
        organisation = self.repository.organisation(connection, oid)
        if organisation is None:
            raise MembershipError(
                404,
                "organisation_unavailable",
                "Organisation unavailable. Check the ID and try again.",
            )
        return organisation

    def _member(self, connection, actor, oid, *, owner=False):
        membership = self.repository.membership(connection, actor, oid)
        if membership is None or membership["status"] != ACTIVE:
            raise MembershipError(404, "scope_unavailable", "Organisation unavailable.")
        if owner and membership["role"] != OWNER:
            raise MembershipError(
                403, "owner_required", "Only an organisation Owner can manage access."
            )
        return membership

    def create(self, actor, name):
        name = name.strip()
        if (
            not name
            or len(name) > 200
            or any(ord(character) < 32 for character in name)
        ):
            raise MembershipError(
                422, "invalid_name", "Enter an organisation name of 1–200 characters."
            )
        with self.database.transaction() as connection:
            self._actor(connection, actor)
            organisation = self.repository.create_organisation(connection, name)
            self.repository.insert(
                connection, actor, int(organisation["id"]), OWNER, ACTIVE
            )
        return {"organisation": dict(organisation, role=OWNER, sites=[])}

    def resolve(self, actor, value):
        oid = organisation_id(value)
        with self.database.connection() as connection:
            self._actor(connection, actor)
            organisation = self._organisation(connection, oid)
            relationship = self.repository.membership(connection, actor, oid)
        return dict(
            organisation=organisation,
            relationship=relationship,
            can_request=relationship is None or relationship["status"] == DISABLED,
        )

    def pending(self, actor):
        with self.database.connection() as connection:
            self._actor(connection, actor)
            rows = self.repository.pending(connection, actor)
        return {
            "invitations": [row for row in rows if row["status"] == INVITED],
            "requests": [row for row in rows if row["status"] == REQUESTED],
        }

    def access(self, actor, value):
        oid = organisation_id(value)
        # Consistent header/authority/roster snapshot; no write or external IO.
        with self.database.transaction() as connection:
            self.repository.lock(connection, oid)
            self._actor(connection, actor)
            organisation = self._organisation(connection, oid)
            membership = self._member(connection, actor, oid)
            owner = membership["role"] == OWNER
            rows = self.repository.roster(connection, oid) if owner else []
        return dict(
            organisation=organisation,
            actor_role=membership["role"],
            can_manage=owner,
            members=[row for row in rows if row["status"] == ACTIVE],
            invitations=[row for row in rows if row["status"] == INVITED],
            requests=[row for row in rows if row["status"] == REQUESTED],
        )

    def initiate(self, actor, value, *, identifier_type=None, identifier=None):
        oid = organisation_id(value)
        invitation = identifier_type is not None
        wanted = INVITED if invitation else REQUESTED
        with self.database.transaction() as connection:
            self.repository.lock(connection, oid)
            self._actor(connection, actor)
            self._organisation(connection, oid)
            target = actor
            if invitation:
                self._member(connection, actor, oid, owner=True)
                if (
                    identifier_type not in {"email", "username"}
                    or not identifier
                    or not identifier.strip()
                    or len(identifier) > 320
                ):
                    raise MembershipError(
                        422, "invalid_identifier", "Enter an exact email or username."
                    )
                found = self.repository.invite_target(
                    connection, identifier_type, identifier.strip()
                )
                if found is None:
                    raise MembershipError(
                        404,
                        "invite_target_unavailable",
                        "This user doesn't have a camOS account yet. Ask them to create a camOS account first. If you're having issues, contact us.",
                    )
                if found["user_status"] != ACTIVE:
                    raise MembershipError(
                        409,
                        "invite_target_disabled",
                        "This account is unavailable. If you're having issues, contact us.",
                    )
                target = int(found["user_id"])
                if target == actor:
                    conflict("self_invite", "You already belong to this organisation.")
            current = self.repository.membership(connection, target, oid)
            if current and current["status"] == ACTIVE:
                conflict(
                    "already_active",
                    "This user already belongs to this organisation."
                    if invitation
                    else "You already belong to this organisation.",
                )
            if current and current["status"] in {INVITED, REQUESTED}:
                if current["status"] != wanted:
                    conflict(
                        "already_requested" if invitation else "already_invited",
                        "An access request is already pending. Approve or decline it instead."
                        if invitation
                        else "You already have an invitation. Accept or decline it in Manage Access.",
                    )
                if current["role"] != MEMBER:
                    conflict(
                        "invalid_transition",
                        "This pending relationship is unavailable. Contact us for help.",
                    )
                return current, False
            if current is None:
                return self.repository.insert(
                    connection, target, oid, MEMBER, wanted
                ), True
            result = self.repository.transition(connection, current, MEMBER, wanted)
            if result is None:
                conflict("stale_state", "Access has changed. Refresh and try again.")
            return result, False

    def decide(
        self, actor, value, action, expected: datetime | None, target_value=None
    ):
        oid = organisation_id(value)
        personal = action in {"accept", "decline_invitation"}
        target = actor if personal else user_id(target_value)
        start, finish = {
            "accept": (INVITED, ACTIVE),
            "decline_invitation": (INVITED, DISABLED),
            "withdraw": (INVITED, DISABLED),
            "approve": (REQUESTED, ACTIVE),
            "decline_request": (REQUESTED, DISABLED),
            "disable": (ACTIVE, DISABLED),
        }[action]
        with self.database.transaction() as connection:
            self.repository.lock(connection, oid)
            self._actor(connection, actor)
            self._organisation(connection, oid)
            if not personal:
                self._member(connection, actor, oid, owner=True)
                if target == actor:
                    conflict(
                        "self_management_not_supported",
                        "You can't change your own access here.",
                    )
            current = self.repository.membership(connection, target, oid)
            if current is None:
                raise MembershipError(
                    404, "relationship_unavailable", "This membership is unavailable."
                )
            if current["status"] == finish:
                return current  # Harmless replay; never a second mutation.
            if current["status"] != start:
                conflict(
                    "invalid_transition", "Access has changed. Refresh and try again."
                )
            if expected != current["status_changed_at"]:
                conflict("stale_state", "Access has changed. Refresh and try again.")
            if finish == ACTIVE and not self.repository.enabled_user(
                connection, target
            ):
                conflict("account_unavailable", "This account is unavailable.")
            if (
                action == "disable"
                and current["role"] == OWNER
                and self.repository.owner_count(connection, oid) <= 1
            ):
                conflict("last_owner", "The organisation must keep an active Owner.")
            # New invitations are always Member. Preserve an existing offer on
            # accept, while request approval can never restore old Owner rights.
            role = MEMBER if action in {"approve", "accept"} else current["role"]
            result = self.repository.transition(connection, current, role, finish)
            if result is None:
                conflict("stale_state", "Access has changed. Refresh and try again.")
            return result
