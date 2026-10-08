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
    value = value.strip()
    if not value or len(value) > 120 or any(ord(character) < 32 for character in value):
        raise LifecycleError(422, 'Username must contain between 1 and 120 characters')
    return value


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

    def start(self, purpose, email, *, username=None, phone=None, password=None, user=None):
        if purpose not in (SIGNUP, RESET, UNLOCK):
            raise ValueError('Unknown lifecycle purpose')
        email = normalized_email(email)
        payload = {}
        if purpose == SIGNUP:
            payload = dict(email=email, username=username_value(username), phone=phone_value(phone),
                           password_hash=passwords.hash_password(password_value(password)))
        handle = secrets.token_urlsafe(32)
        challenge_id = digest(handle)
        code = f'{secrets.randbelow(1_000_000):06d}'

        def operation(cursor):
            target = None
            if purpose == SIGNUP:
                conflict = self.repository.identifiers(cursor, email, payload['username'])
                if conflict:
                    return conflict
            elif purpose == RESET:
                target = self.repository.email_user(cursor, email)
                if target is None or target.status != 1:
                    return None
            else:
                target = self.repository.user(cursor, user.id)
                if target is None or target.status != 1 or target.session_version != user.session_version:
                    return LifecycleError(401, 'Unauthenticated')
            now = self.clock()
            self.repository.insert_challenge(cursor, dict(
                id=challenge_id, purpose=purpose, user_id=target.id if target else None,
                payload=payload, code_hash=keyed_digest(challenge_id + ':' + code),
                code_expires_at=now + timedelta(seconds=CODE_TTL),
                last_sent_at=now, created_at=now,
            ))
            return (target.email if target else email), code

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
                or record['user_id'] != target.id
                or (user and target.session_version != user.session_version)):
            return None, None
        return record, target

    def pending(self, cursor, handle, purpose, user=None):
        record, target = self.locked_challenge(cursor, handle, purpose, user)
        if not record or record['consumed_at'] is not None or record['verified_at'] is not None:
            return LifecycleError(400, 'This code is unavailable. Please restart the request.')
        if record['created_at'] + timedelta(seconds=CHALLENGE_TTL) <= self.clock():
            return LifecycleError(410, 'This request expired. Please restart.')
        if record['attempts'] >= 5:
            return LifecycleError(429, 'Too many verification attempts. Please restart.')
        return record, target

    def resend(self, purpose, handle, user=None):
        code = f'{secrets.randbelow(1_000_000):06d}'

        def operation(cursor):
            result = self.pending(cursor, handle, purpose, user)
            if isinstance(result, LifecycleError):
                return result
            record, target = result
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

    def verify(self, purpose, handle, code, user=None):
        def operation(cursor):
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
                conflict = self.repository.identifiers(cursor, details['email'], details['username'])
                if conflict:
                    return conflict
                cursor.execute(
                    'INSERT INTO public.users(email,username,phone_number,password_hash,status,created_at) '
                    f'VALUES(%s,%s,%s,%s,1,CURRENT_TIMESTAMP) RETURNING {USER_COLUMNS}',
                    (details['email'], details['username'], details['phone'], details['password_hash']),
                )
                account = CanonicalAuthRepository._user(cursor.fetchone())
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

        def operation(cursor):
            record, target = self.locked_challenge(cursor, handle, RESET)
            if not self.verified(record, RESET):
                return LifecycleError(401, 'Reset session expired or unavailable. Please restart.')
            password_hash = passwords.hash_password(password)
            if not self.verified(record, RESET):
                return LifecycleError(401, 'Reset session expired or unavailable. Please restart.')
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
            changes['username'] = username_value(fields['name'])
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

        def operation(cursor):
            # Acquire identifier locks before the user lock, matching signup's
            # uniqueness path. Column names below come only from this whitelist.
            if 'username' in changes:
                conflict = self.repository.identifiers(cursor, user.email, changes['username'], user.id)
                if conflict:
                    return conflict
            record, target = self.locked_challenge(cursor, handle, UNLOCK, user)
            if not self.verified(record, UNLOCK):
                return LifecycleError(401, 'Unlock expired. Please unlock again.')
            updates = dict(changes)
            if new_password is not None:
                updates['password_hash'] = passwords.hash_password(new_password)
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
