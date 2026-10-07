"""Narrow PostgreSQL state machines for signup, recovery and account unlock."""

import hashlib
import hmac
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
GRANT_TTL = {'reset': 600, 'unlock': 300}
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

    def limit(self, scope, subject, limit=10):
        now = self.clock()
        allowed = self.repository.transact(
            lambda cursor: self.repository.budget(cursor, keyed_digest(scope + ':' + subject), now, limit)
        )
        if not allowed:
            raise LifecycleError(429, 'Too many requests. Please try again later.')

    def start(self, purpose, email, *, username=None, phone=None, password=None,
              user=None, session_binding=None, client_key=''):
        email = normalized_email(email)
        # Starts cannot replenish code attempts indefinitely. Budgets apply to
        # unknown/disabled reset targets too, so rate responses reveal no status.
        self.limit(purpose + ':start', email)
        if client_key:
            self.limit(purpose + ':client', client_key, 300)
        payload = {}
        if purpose == 'signup':
            payload = dict(username=username_value(username), phone=phone_value(phone),
                           password_hash=passwords.hash_password(password_value(password)))
        now = self.clock()
        handle = secrets.token_urlsafe(32)
        challenge_id = digest(handle)
        code = f'{secrets.randbelow(1_000_000):06d}'

        def operation(cursor):
            target = user
            if purpose == 'signup':
                conflict = self.repository.identifiers(cursor, email, payload['username'])
                if conflict:
                    return conflict
            elif purpose == 'reset':
                target = self.repository.email_user(cursor, email)
                if target is None or target.status != 1:
                    return False
            else:
                target = self.repository.user(cursor, user.id)
                if target is None or target.status != 1 or target.session_version != user.session_version:
                    return LifecycleError(401, 'Unauthenticated')
            self.repository.insert_challenge(cursor, dict(
                id=challenge_id, purpose=purpose, email=email,
                user_id=target.id if target else None,
                session_version=target.session_version if target else None,
                session_binding=session_binding, payload=payload,
                code_hash=keyed_digest(challenge_id + ':' + code),
                code_expires_at=now + timedelta(seconds=CODE_TTL),
                expires_at=now + timedelta(seconds=CHALLENGE_TTL), last_sent_at=now,
            ))
            return True

        created = self.repository.transact(operation)
        return handle, (email, code) if created else None

    @staticmethod
    def deliver(purpose, email, code):
        sender = {'signup': postmark_email.send_verification_email,
                  'reset': postmark_email.send_password_reset_code_email,
                  'unlock': postmark_email.send_settings_unlock_code_email}[purpose]
        sender(to_email=email, code=code)

    def pending(self, cursor, handle, purpose, user=None, binding=None):
        record = self.repository.challenge(cursor, digest(handle or ''), purpose)
        if not record or record['state'] != 'pending':
            return LifecycleError(400, 'This code is unavailable. Please restart the request.')
        if user and (record['user_id'] != user.id or record['session_version'] != user.session_version
                     or record['session_binding'] != binding):
            return LifecycleError(401, 'Unlock required')
        if record['expires_at'] <= self.clock():
            return LifecycleError(410, 'This request expired. Please restart.')
        if record['attempts'] >= 5:
            return LifecycleError(429, 'Too many verification attempts. Please restart.')
        return record

    def resend(self, purpose, handle, user=None, binding=None):
        code = f'{secrets.randbelow(1_000_000):06d}'

        def operation(cursor):
            record = self.pending(cursor, handle, purpose, user, binding)
            if isinstance(record, LifecycleError):
                return record
            now = self.clock()
            if (now - record['last_sent_at']).total_seconds() < RESEND_COOLDOWN:
                return LifecycleError(429, 'Please wait before requesting another code.')
            if record['resends'] >= 5:
                return LifecycleError(429, 'Maximum resend attempts reached. Please restart.')
            if purpose != 'signup':
                target = self.repository.user(cursor, record['user_id'])
                if not target or target.status != 1 or target.session_version != record['session_version']:
                    return LifecycleError(400, 'This request is unavailable. Please restart.')
            self.repository.update_challenge(cursor, record['id'],
                code_hash=keyed_digest(record['id'] + ':' + code),
                code_expires_at=min(now + timedelta(seconds=CODE_TTL), record['expires_at']),
                resends=record['resends'] + 1, last_sent_at=now)
            return record['email'], code, 4 - record['resends']

        return self.repository.transact(operation)

    def verify(self, purpose, handle, code, user=None, binding=None):

        def operation(cursor):
            record = self.pending(cursor, handle, purpose, user, binding)
            if isinstance(record, LifecycleError):
                return record
            now = self.clock()
            if record['code_expires_at'] <= now:
                return LifecycleError(410, 'Verification code expired. Please resend a new code.')
            valid = bool(re.fullmatch(r'\d{6}', code)) and hmac.compare_digest(
                keyed_digest(record['id'] + ':' + code), record['code_hash'])
            if not valid:
                attempts = record['attempts'] + 1
                self.repository.update_challenge(cursor, record['id'], attempts=attempts,
                    state='exhausted' if attempts >= 5 else 'pending')
                return LifecycleError(429 if attempts >= 5 else 400,
                    'Too many verification attempts. Please restart.' if attempts >= 5 else 'Invalid verification code.')
            if purpose == 'signup':
                details = record['payload']
                conflict = self.repository.identifiers(cursor, record['email'], details['username'])
                if conflict:
                    return conflict
                cursor.execute(
                    'INSERT INTO public.users(email,username,phone_number,password_hash,status,document_owner_key) '
                    f'VALUES(%s,%s,%s,%s,1,%s) RETURNING {USER_COLUMNS}',
                    (record['email'], details['username'], details['phone'], details['password_hash'],
                     'canonical:' + secrets.token_hex(24)),
                )
                result = CanonicalAuthRepository._user(cursor.fetchone())
                self.repository.update_challenge(cursor, record['id'], state='consumed')
                return result
            target = self.repository.user(cursor, record['user_id'])
            if not target or target.status != 1 or target.session_version != record['session_version']:
                return LifecycleError(400, 'This request is unavailable. Please restart.')
            grant = secrets.token_urlsafe(32)
            self.repository.update_challenge(cursor, record['id'], state='granted',
                grant_hash=digest(grant), grant_expires_at=now + timedelta(seconds=GRANT_TTL[purpose]))
            return grant

        return self.repository.transact(operation)

    def reset_password(self, handle, grant, password, confirmation):
        self.limit('reset:completion', digest(handle or ''), 10)
        password = password_value(password, confirmation)

        def operation(cursor):
            record = self.repository.challenge(cursor, digest(handle or ''), 'reset')
            now = self.clock()
            if not self.valid_grant(record, grant, now):
                return LifecycleError(401, 'Reset session expired or unavailable. Please restart.')
            target = self.repository.user(cursor, record['user_id'])
            if not target or target.status != 1 or target.session_version != record['session_version']:
                return LifecycleError(401, 'Reset session expired or unavailable. Please restart.')
            if not self.valid_grant(record, grant, self.clock()):
                return LifecycleError(401, 'Reset session expired or unavailable. Please restart.')
            password_hash = passwords.hash_password(password)
            cursor.execute('UPDATE public.users SET password_hash=%s, session_version=session_version+1, '
                           'account_version=account_version+1 WHERE id=%s', (password_hash, target.id))
            # Other challenges are version-invalidated, without acquiring their
            # row locks (avoids deadlock between parallel reset completions).
            self.repository.update_challenge(cursor, record['id'], state='consumed', grant_hash=None)
            return None

        self.repository.transact(operation)

    @staticmethod
    def valid_grant(record, token, now):
        return bool(record and record['state'] == 'granted' and record['grant_expires_at']
                    and record['grant_expires_at'] > now and token and record['grant_hash']
                    and hmac.compare_digest(digest(token), record['grant_hash']))

    def update_account(self, user, handle, grant, binding, fields):
        if 'name' in fields and fields['name'] is None:
            raise LifecycleError(422, 'Username is required')
        self.limit('account:write', str(user.id), 60)
        new_username = username_value(fields['name']) if 'name' in fields else None
        new_phone = phone_value(fields['phone']) if 'phone' in fields else None
        new_hash = None
        if fields.get('password') is not None:
            if fields.get('confirm_password') is None:
                raise LifecycleError(422, 'Password and confirm password are required')
            new_hash = passwords.hash_password(password_value(fields['password'], fields.get('confirm_password')))
        elif fields.get('confirm_password') is not None:
            raise LifecycleError(422, 'Password and confirm password are required')
        if not any(key in fields for key in ('name', 'phone', 'password')):
            raise LifecycleError(422, 'No account changes supplied')

        def operation(cursor):
            record = self.repository.challenge(cursor, digest(handle or ''), 'unlock')
            now = self.clock()
            if (not self.valid_grant(record, grant, now) or record['user_id'] != user.id
                    or record['session_binding'] != binding):
                return LifecycleError(401, 'Unlock expired. Please unlock again.')
            target = self.repository.user(cursor, user.id)
            if not target or target.status != 1 or target.session_version != record['session_version']:
                return LifecycleError(401, 'Unlock expired. Please unlock again.')
            if not self.valid_grant(record, grant, self.clock()):
                return LifecycleError(401, 'Unlock expired. Please unlock again.')
            if target.account_version != fields.get('account_version', user.account_version):
                return LifecycleError(409, 'Account changed elsewhere. Reload before saving.')
            if new_username is not None:
                conflict = self.repository.identifiers(cursor, target.email, new_username, target.id)
                if conflict:
                    return conflict
            cursor.execute(
                'UPDATE public.users SET username=%s,phone_number=%s,password_hash=%s, '
                'account_version=account_version+1,session_version=session_version+%s '
                f'WHERE id=%s RETURNING {USER_COLUMNS}',
                (new_username if new_username is not None else target.username,
                 new_phone if 'phone' in fields else target.phone_number,
                 new_hash or target.password_hash, 1 if new_hash else 0, target.id),
            )
            result = CanonicalAuthRepository._user(cursor.fetchone())
            if new_hash:
                self.repository.update_challenge(cursor, record['id'], state='consumed', grant_hash=None)
            return result

        return self.repository.transact(operation)
