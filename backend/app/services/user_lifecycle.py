"""Narrow PostgreSQL state machines for signup, recovery and account unlock."""

import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from . import passwords, postmark_email
from .user_lifecycle_repository import LifecycleError, USER_COLUMNS
from .canonical_auth import CanonicalAuthRepository
from .provider_auth_repository import ProviderAuthRepository
from .user_policy import InvalidUsername, username_value as validate_username, seed_username

CODE_TTL = 900
CHALLENGE_TTL = 3600
RESEND_COOLDOWN = 30
SIGNUP, RESET, UNLOCK = 0, 1, 2
VERIFIED_TTL = {RESET: 600, UNLOCK: 300}
logger = logging.getLogger(__name__)
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
PHONE_RE = re.compile(r'^\+[1-9]\d{6,14}$')


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def keyed_digest(value):
    key = os.getenv('PORTAL_SESSION_SECRET', '')
    if len(key) < 32:
        raise RuntimeError('PORTAL_SESSION_SECRET must contain at least 32 characters')
    return hmac.new(key.encode(), ('lifecycle:' + value).encode(), hashlib.sha256).hexdigest()


def normalized_email(value):
    value = value.strip().lower()
    if len(value) > 320 or not EMAIL_RE.fullmatch(value):
        raise LifecycleError(422, 'Not a valid email address')
    return value


def username_value(value):
    try:
        return validate_username(value)
    except InvalidUsername as error:
        raise LifecycleError(422, str(error)) from None


def phone_value(value):
    value = value.strip() if value else None
    if value and not PHONE_RE.fullmatch(value):
        raise LifecycleError(422, 'Not a valid phone number')
    return value or None


def password_value(value, confirmation=None):
    if len(value) < 8:
        raise LifecycleError(422, 'Password must be at least 8 characters')
    if len(value) > 1024:
        raise LifecycleError(422, 'Password is too long')
    if confirmation is not None and value != confirmation:
        raise LifecycleError(422, 'Passwords do not match')
    return value


class UserLifecycle:
    def __init__(self, repository, clock=None):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def cleanup_expired(self, limit=100):
        """Best-effort small request/startup batch; never affect a journey result."""
        try:
            return self.repository.transact(lambda cursor: self.repository.cleanup(
                cursor, self.clock(), min(max(limit, 1), 100), CHALLENGE_TTL,
                VERIFIED_TTL[RESET], VERIFIED_TTL[UNLOCK]))
        except Exception:
            logger.warning('account.cleanup_deferred')
            return 0

    def start(self, purpose, identity, *, username=None, phone=None, password=None, user=None, provider_identity=None):
        if purpose not in (SIGNUP, RESET, UNLOCK):
            raise ValueError('Unknown lifecycle purpose')
        identity = normalized_email(identity)
        payload = {}
        if purpose == SIGNUP:
            payload = dict(email=identity, username=username_value(username),
                           phone=None if provider_identity else phone_value(phone),
                           password_hash=None)
            if provider_identity:
                if provider_identity['provider'] != 1:
                    raise ValueError('Only Microsoft signup requires camOS verification')
                payload['provider_identity'] = provider_identity
            else:
                password = password_value(password)
            # Reserve the shared budget before expensive work, then release its
            # short transaction before Argon2. Never hold a SQL connection while
            # waiting for hash capacity during signup.
            allowed = self.repository.transact(lambda cursor: self.repository.consume_start_budget(
                cursor, purpose, identity, self.clock()))
            if not allowed:
                raise LifecycleError(429, 'Too many requests. Please try again later.')
            if not provider_identity:
                payload['password_hash'] = passwords.hash_password(password)
        handle = secrets.token_urlsafe(32)
        challenge_id = digest(handle)
        code = f'{secrets.randbelow(1_000_000):06d}'
        # Check shared signing configuration before resolving eligibility, so a
        # missing secret is a common service failure, not an identity signal.
        code_hash = keyed_digest(challenge_id + ':' + code)

        def operation(cursor):
            target = None
            if purpose == SIGNUP:
                if provider_identity:
                    ProviderAuthRepository.lock_identity(cursor, provider_identity)
                    if ProviderAuthRepository.mapped_user(cursor, provider_identity) is not None:
                        return LifecycleError(409, 'Please restart provider sign-in.')
                conflict = self.repository.reserve_email(cursor, identity)
                if conflict:
                    return conflict
            elif purpose == RESET:
                target = CanonicalAuthRepository.resolve_email(cursor, identity, lock=True)
                if target is None or target.status != 1 or target.id == 999999:
                    return None
                if target.password_hash is None:
                    return target
            else:
                target = self.repository.user(cursor, user.id)
                if (target is None or target.status != 1 or target.id == 999999
                        or target.session_version != user.session_version or target.password_hash != user.password_hash):
                    return LifecycleError(401, 'Unauthenticated')
            now = self.clock()
            if purpose != SIGNUP and not self.repository.consume_start_budget(cursor, purpose, identity, now):
                # Recovery eligibility remains generic even when its delivery
                # budget is exhausted; no fresh credential is issued.
                return None if purpose == RESET else LifecycleError(429, 'Too many requests. Please try again later.')
            self.repository.insert_challenge(cursor, dict(
                id=challenge_id, purpose=purpose, user_id=target.id if target else None,
                payload=payload, code_hash=code_hash,
                code_expires_at=now + timedelta(seconds=CODE_TTL),
                last_sent_at=now, created_at=now,
            ))
            return (target.email if target else identity), code

        return handle, self.repository.transact(operation)

    @staticmethod
    def deliver(purpose, email, code):
        sender = {SIGNUP: postmark_email.send_verification_email,
                  RESET: postmark_email.send_password_reset_code_email,
                  UNLOCK: postmark_email.send_settings_unlock_code_email}[purpose]
        sender(to_email=email, code=code)

    def locked_challenge(self, cursor, handle, purpose, user=None):
        challenge_id = digest(handle or '')
        if purpose == SIGNUP:
            return self.repository.challenge(cursor, challenge_id, purpose), None
        # Peek only to find its canonical user. Acquire user before challenge so
        # credential-change invalidation cannot deadlock parallel completions.
        record = self.repository.challenge(cursor, challenge_id, purpose, lock=False)
        if not record or record['user_id'] is None or (user and record['user_id'] != user.id):
            return None, None
        target = self.repository.user(cursor, record['user_id'])
        record = self.repository.challenge(cursor, challenge_id, purpose)
        if (not record or not target or target.status != 1
                or target.id == 999999
                or (purpose == RESET and target.password_hash is None)
                or record['user_id'] != target.id
                or (user and target.session_version != user.session_version)):
            return None, None
        return record, target

    def pending(self, cursor, handle, purpose, user=None):
        record, target = self.locked_challenge(cursor, handle, purpose, user)
        if not record or record['consumed_at'] is not None or record['verified_at'] is not None:
            return LifecycleError(400, 'This password reset is unavailable or has expired.' if purpose == RESET
                                  else 'This code is unavailable. Please restart the request.')
        if record['created_at'] + timedelta(seconds=CHALLENGE_TTL) <= self.clock():
            return LifecycleError(410, 'This password reset is unavailable or has expired.' if purpose == RESET
                                  else 'This request expired. Please restart.')
        if record['attempts'] >= 5:
            return LifecycleError(429, 'Too many verification attempts. Please restart.')
        return record, target

    def signup_context(self, handle):
        """Safe presentation for the inline provider code state; no identity DTO."""
        def operation(cursor):
            result = self.pending(cursor, handle, SIGNUP)
            if isinstance(result, LifecycleError):
                return result
            record, _ = result
            if record['payload'].get('provider_identity', {}).get('provider') != 1:
                return LifecycleError(410, 'Please restart provider sign-in.')
            return dict(email=record['payload']['email'],
                expiresInSeconds=max(0, int((record['code_expires_at'] - self.clock()).total_seconds())),
                resendCooldownSeconds=max(0, RESEND_COOLDOWN - int((self.clock() - record['last_sent_at']).total_seconds())))
        return self.repository.transact(operation)

    def resend(self, purpose, handle, user=None, *, provider_signup=False):
        code = f'{secrets.randbelow(1_000_000):06d}'

        def operation(cursor):
            result = self.pending(cursor, handle, purpose, user)
            if isinstance(result, LifecycleError):
                return result
            record, target = result
            if purpose == SIGNUP and bool(record['payload'].get('provider_identity')) != provider_signup:
                return LifecycleError(410, 'Please restart the request.')
            now = self.clock()
            if (now - record['last_sent_at']).total_seconds() < RESEND_COOLDOWN:
                return LifecycleError(429, 'Please wait before requesting another code.')
            if record['resends'] >= 5:
                return LifecycleError(429, 'Maximum resend attempts reached. Please restart.')
            self.repository.update_challenge(cursor, record['id'],
                code_hash=keyed_digest(record['id'] + ':' + code),
                code_expires_at=min(now + timedelta(seconds=CODE_TTL),
                                    record['created_at'] + timedelta(seconds=CHALLENGE_TTL)),
                resends=record['resends'] + 1, last_sent_at=now)
            return (target.email if target else record['payload']['email']), code, 4 - record['resends']

        return self.repository.transact(operation)

    def verify(self, purpose, handle, code, user=None, *, provider_signup=False):
        def operation(cursor):
            # For signup, acquire identity/email before the challenge row. The
            # immutable payload is rechecked under its lock below.
            if purpose == SIGNUP:
                peek = self.repository.challenge(cursor, digest(handle or ''), SIGNUP, lock=False)
                if peek:
                    mapping = peek['payload'].get('provider_identity')
                    if bool(mapping) != provider_signup:
                        return LifecycleError(410, 'Please restart the request.')
                    if mapping:
                        ProviderAuthRepository.lock_identity(cursor, mapping)
                    ProviderAuthRepository.lock_email(cursor, peek['payload']['email'])
            result = self.pending(cursor, handle, purpose, user)
            if isinstance(result, LifecycleError):
                return result
            record, _ = result
            now = self.clock()
            if record['code_expires_at'] <= now:
                return LifecycleError(410, 'Verification code expired. Please resend a new code.')
            valid = bool(re.fullmatch(r'\d{6}', code)) and hmac.compare_digest(
                keyed_digest(record['id'] + ':' + code), record['code_hash'])
            if not valid:
                attempts = record['attempts'] + 1
                self.repository.update_challenge(cursor, record['id'], attempts=attempts)
                return LifecycleError(429 if attempts >= 5 else 400,
                    'Too many verification attempts. Please restart.' if attempts >= 5 else 'Invalid verification code.')
            if purpose == SIGNUP:
                details = record['payload']
                if details.get('provider_identity') and ProviderAuthRepository.mapped_user(cursor, details['provider_identity']) is not None:
                    return LifecycleError(409, 'Please restart provider sign-in.')
                conflict = self.repository.reserve_email(cursor, details['email'])
                if conflict:
                    return conflict
                username = (seed_username(details['username'], details['email'])
                            if details.get('provider_identity') else username_value(details['username']))
                account = CanonicalAuthRepository.create_customer(
                    cursor, details['email'], username, details['phone'], details['password_hash'])
                if details.get('provider_identity'):
                    # A conflict raises inside the same transaction, rolling back
                    # the user insert and preserving no orphan account.
                    ProviderAuthRepository.insert(cursor, account.id, details['provider_identity'])
                self.repository.update_challenge(cursor, record['id'], verified_at=now, consumed_at=now)
                self.repository.delete_challenge(cursor, record['id'], SIGNUP)
                return account
            self.repository.update_challenge(cursor, record['id'], verified_at=now)
            # The same opaque handle identifies the verified working row. No
            # second credential, signed grant, or additional payload is created.
            return handle

        return self.repository.transact(operation)

    def verified(self, record, purpose):
        return bool(record and record['purpose'] == purpose
                    and record['verified_at'] is not None and record['consumed_at'] is None
                    and record['verified_at'] + timedelta(seconds=VERIFIED_TTL[purpose]) > self.clock())

    def reset_password(self, handle, password, confirmation):
        password = password_value(password, confirmation)

        def preflight(cursor):
            record, target = self.locked_challenge(cursor, handle, RESET)
            if not self.verified(record, RESET):
                return LifecycleError(401, 'This password reset is unavailable or has expired.')
            return target
        expected = self.repository.transact(preflight)
        password_hash = passwords.hash_password(password)

        def operation(cursor):
            record, target = self.locked_challenge(cursor, handle, RESET)
            if not self.verified(record, RESET):
                return LifecycleError(401, 'This password reset is unavailable or has expired.')
            if target.session_version != expected.session_version or target.password_hash != expected.password_hash:
                return LifecycleError(401, 'This password reset is unavailable or has expired.')
            cursor.execute('UPDATE public.users SET password_hash=%s, session_version=session_version+1 '
                           'WHERE id=%s', (password_hash, target.id))
            self.repository.invalidate_user_challenges(cursor, target.id)
            return None

        self.repository.transact(operation)

    def update_account(self, user, handle, fields):
        changes = {}
        if 'name' in fields:
            if fields['name'] is None:
                raise LifecycleError(422, 'Username is required')
            changes['username'] = fields['name']
        if 'phone' in fields:
            changes['phone_number'] = phone_value(fields['phone'])
        new_password = None
        if fields.get('password') is not None:
            if fields.get('confirm_password') is None:
                raise LifecycleError(422, 'Password and confirm password are required')
            new_password = password_value(fields['password'], fields['confirm_password'])
        elif fields.get('confirm_password') is not None:
            raise LifecycleError(422, 'Password and confirm password are required')
        if not changes and new_password is None:
            raise LifecycleError(422, 'No account changes supplied')
        new_hash = None
        expected = None
        if new_password is not None:
            def preflight(cursor):
                record, target = self.locked_challenge(cursor, handle, UNLOCK, user)
                if not self.verified(record, UNLOCK):
                    return LifecycleError(401, 'Unlock expired. Please unlock again.')
                return target
            expected = self.repository.transact(preflight)
            new_hash = passwords.hash_password(new_password)

        def operation(cursor):
            # Profile names have no uniqueness or authentication authority.
            record, target = self.locked_challenge(cursor, handle, UNLOCK, user)
            if not self.verified(record, UNLOCK):
                return LifecycleError(401, 'Unlock expired. Please unlock again.')
            updates = dict(changes)
            if 'username' in updates and updates['username'] != target.username:
                updates['username'] = username_value(updates['username'])
            if new_password is not None:
                if target.password_hash != expected.password_hash or target.session_version != expected.session_version:
                    return LifecycleError(401, 'Unlock expired. Please unlock again.')
                updates['password_hash'] = new_hash
            if not self.verified(record, UNLOCK):
                return LifecycleError(401, 'Unlock expired. Please unlock again.')
            assignments = ','.join(column + '=%s' for column in updates)
            if new_password is not None:
                assignments += ',session_version=session_version+1'
            cursor.execute(f'UPDATE public.users SET {assignments} WHERE id=%s RETURNING {USER_COLUMNS}',
                           (*updates.values(), target.id))
            account = CanonicalAuthRepository._user(cursor.fetchone())
            if new_password is not None:
                self.repository.invalidate_user_challenges(cursor, target.id)
            return account

        return self.repository.transact(operation)

    def end_unlock(self, user, handle):
        def operation(cursor):
            record, _ = self.locked_challenge(cursor, handle, UNLOCK, user)
            if record:
                self.repository.delete_challenge(cursor, record['id'], UNLOCK)
        self.repository.transact(operation)
