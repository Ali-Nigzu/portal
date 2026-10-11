"""OIDC proves an identity; camOS owns accounts, linking and normal sessions."""

from dataclasses import dataclass

from .canonical_auth import CanonicalAuthRepository
from . import passwords
from .provider_oidc import ProviderError
from .user_lifecycle import normalized_email, username_value
from .user_lifecycle_repository import LifecycleError


@dataclass(frozen=True)
class ProviderDecision:
    kind: str
    user: object = None
    email: str | None = None
    username: str | None = None


def enabled(user):
    if user is None or user.status != 1 or user.id == 999999:
        raise ProviderError('provider-error', 403)
    return user


def seed_username(name, email):
    clean = ''.join(c for c in (name or '') if ord(c) >= 32 and ord(c) != 127).strip()[:120]
    return username_value(clean or email.split('@', 1)[0][:120])


class ProviderAuth:
    def __init__(self, repository, oidc):
        self.repository, self.oidc = repository, oidc

    def resolve(self, identity, intent):
        mapping = identity.mapping()

        def operation(cursor):
            self.repository.lock_identity(cursor, mapping)
            owner = self.repository.mapped_user(cursor, mapping)
            if owner is not None:
                return ProviderDecision('session', enabled(self.repository.user(cursor, owner)))
            try:
                email = normalized_email(identity.email or '')
            except LifecycleError:
                raise ProviderError('provider-email', 400) from None
            if identity.provider == 'google' and not identity.email_verified:
                raise ProviderError('provider-email', 400)
            self.repository.lock_email(cursor, email)
            candidate = CanonicalAuthRepository.resolve_email(cursor, email, lock=True)
            if candidate is not None:
                enabled(candidate)
                if candidate.password_hash is None:
                    return ProviderDecision('provider-required', candidate)
                if self.repository.user_provider(cursor, candidate.id, mapping['provider']):
                    raise ProviderError('provider-conflict', 409)
                return ProviderDecision('link', candidate, email)
            if intent == 'login':
                return ProviderDecision('signup-required')
            if intent != 'signup':
                raise ProviderError()
            username = seed_username(identity.name, email)
            if identity.provider == 'microsoft':
                return ProviderDecision('verify-email', email=email, username=username)
            return ProviderDecision('session', enabled(self.repository.create(cursor, email, username, mapping)))

        return self.repository.transact(operation)

    def confirm(self, ticket, password):
        mapping = ticket['identity']
        # Password verification happens before taking row locks. Recheck its
        # exact canonical snapshot under lock before inserting any mapping.
        def snapshot(cursor):
            return enabled(self.repository.user(cursor, int(ticket['user_id'])))
        candidate = self.repository.transact(snapshot)
        if (candidate.session_version != ticket['version'] or candidate.email != ticket['email']
                or candidate.password_hash is None):
            raise ProviderError('provider-expired', 410)
        if not passwords.verify_password(password, candidate.password_hash):
            raise ProviderError('incorrect-password', 401)

        def operation(cursor):
            self.repository.lock_identity(cursor, mapping)
            self.repository.lock_email(cursor, candidate.email)
            current = enabled(self.repository.user(cursor, candidate.id))
            if (current.email != candidate.email or current.session_version != candidate.session_version
                    or current.password_hash != candidate.password_hash):
                raise ProviderError('provider-expired', 410)
            if self.repository.mapped_user(cursor, mapping) is not None or self.repository.user_provider(
                    cursor, current.id, mapping['provider']):
                raise ProviderError('provider-conflict', 409)
            self.repository.insert(cursor, current.id, mapping)
            return current
        return self.repository.transact(operation)
