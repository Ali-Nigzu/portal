"""Confidential OIDC clients and encrypted, purpose-bound browser transactions."""

import base64
import hmac
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlsplit
from uuid import UUID

import requests
from authlib.integrations.requests_client import OAuth2Session
from authlib.oidc.core import CodeIDToken
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from joserfc import jwt
from joserfc.jwk import KeySet

from .session_tokens import _secret

PROVIDERS = {'google': 0, 'microsoft': 1}
TRANSACTION_TTL = 600
LINK_TTL = 300
ENDPOINTS = {
    'google': ('https://accounts.google.com/o/oauth2/v2/auth',
               'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v3/certs'),
    'microsoft': ('https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                  'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                  'https://login.microsoftonline.com/common/discovery/v2.0/keys'),
}


class ProviderError(Exception):
    """Closed public failure category; never carries provider payloads."""
    def __init__(self, kind='provider-error', status=400):
        self.kind, self.status = kind, status
        super().__init__(kind)


@dataclass(frozen=True)
class ProviderIdentity:
    provider: str
    issuer: str
    subject: str
    email: str | None
    name: str | None
    email_verified: bool = False

    def mapping(self):
        return {'provider': PROVIDERS[self.provider], 'issuer': self.issuer, 'subject': self.subject}


def callback_uri(provider):
    # Preserve PRODUCTION_DOMAIN's existing hostname semantics. Never use Host.
    domain = os.getenv('PRODUCTION_DOMAIN', '').strip()
    parsed = urlsplit('https://' + domain)
    if (provider not in PROVIDERS or not domain or parsed.netloc != domain
            or parsed.hostname != domain.lower() or parsed.username is not None
            or parsed.port is not None or parsed.path or parsed.query or parsed.fragment
            or any(c.isspace() or c in '\\/@?#' for c in domain)):
        raise ProviderError('provider-unavailable', 503)
    return 'https://' + domain + '/api/auth/' + provider + '/callback'


class ProtectedTickets:
    """No tokens or plaintext identity authority in browser-readable storage."""
    @staticmethod
    def cipher(purpose):
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                   info=('camos:oidc:' + purpose).encode()).derive(_secret())
        return Fernet(base64.urlsafe_b64encode(key))

    def seal(self, purpose, value, ttl):
        return self.cipher(purpose).encrypt(json.dumps({**value, 'expires': int(time.time()) + ttl},
            separators=(',', ':')).encode()).decode()

    def open(self, purpose, token, ttl):
        try:
            if not token or len(token) > 4096:
                raise ValueError()
            value = json.loads(self.cipher(purpose).decrypt(token.encode(), ttl=ttl))
            if not isinstance(value, dict) or type(value['expires']) is not int or value['expires'] <= time.time():
                raise ValueError()
            return value
        except (InvalidToken, ValueError, TypeError, KeyError, UnicodeError):
            raise ProviderError('provider-expired', 410) from None


class ProviderOIDC:
    def __init__(self):
        self.tickets = ProtectedTickets()
        self._keys = {}
        self._lock = threading.Lock()

    @staticmethod
    def config(provider):
        if provider not in PROVIDERS:
            raise ProviderError('provider-unavailable', 404)
        client_id = os.getenv(provider.upper() + '_CLIENT_ID', '').strip()
        secret = os.getenv(provider.upper() + '_CLIENT_SECRET', '').strip()
        if not client_id or not secret:
            raise ProviderError('provider-unavailable', 503)
        return client_id, secret, callback_uri(provider)

    def start(self, provider, intent):
        client_id, secret, callback = self.config(provider)
        state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
        with OAuth2Session(client_id, secret, scope='openid email profile',
                redirect_uri=callback, code_challenge_method='S256') as client:
            url, _ = client.create_authorization_url(ENDPOINTS[provider][0], state=state,
                code_verifier=verifier, nonce=nonce, response_mode='query')
        ticket = self.tickets.seal('transaction', dict(provider=provider, intent=intent,
            state=state, nonce=nonce, verifier=verifier, callback=callback), TRANSACTION_TTL)
        return url, ticket

    def transaction(self, provider, cookie, state):
        value = self.tickets.open('transaction', cookie, TRANSACTION_TTL)
        if (value.get('provider') != provider or value.get('intent') not in ('login', 'signup')
                or not state or not hmac.compare_digest(value.get('state', ''), state)
                or value.get('callback') != callback_uri(provider)):
            raise ProviderError('provider-expired', 400)
        return value

    def keys(self, provider, *, refresh=False):
        with self._lock:
            cached = self._keys.get(provider)
            # Invalid tokens cannot force an unbounded remote refresh loop.
            if cached and cached[0] > time.monotonic() and (not refresh or cached[2] + 30 > time.monotonic()):
                return cached[1]
            try:
                response = requests.get(ENDPOINTS[provider][2], timeout=(3, 10), allow_redirects=False)
                response.raise_for_status()
                if len(response.content) > 1_000_000:
                    raise ValueError()
                keys = response.json()['keys']
                if not isinstance(keys, list) or not keys or len(keys) > 100:
                    raise ValueError()
                self._keys[provider] = (time.monotonic() + 300, keys, time.monotonic())
                return keys
            except Exception:
                raise ProviderError('provider-unavailable', 503) from None

    def validate(self, provider, encoded, transaction, access_token=None):
        client_id, _, _ = self.config(provider)
        try:
            if not isinstance(encoded, str) or len(encoded) > 16384:
                raise ValueError()
            keys = self.keys(provider)
            try:
                decoded = jwt.decode(encoded, KeySet.import_key_set({'keys': keys}), algorithms=['RS256'])
            except Exception:
                # One bounded refresh supports rotation. No token-supplied URLs.
                keys = self.keys(provider, refresh=True)
                decoded = jwt.decode(encoded, KeySet.import_key_set({'keys': keys}), algorithms=['RS256'])
            claims = decoded.claims
            if provider == 'google':
                if claims.get('iss') not in ('accounts.google.com', 'https://accounts.google.com'):
                    raise ValueError()
                issuer = 'https://accounts.google.com'
            else:
                tid = claims.get('tid')
                if not isinstance(tid, str) or str(UUID(tid)) != tid.lower():
                    raise ValueError()
                issuer = 'https://login.microsoftonline.com/' + tid + '/v2.0'
                if claims.get('iss') != issuer:
                    raise ValueError()
                allowed = [key for key in keys if key.get('issuer') in (
                    issuer, 'https://login.microsoftonline.com/{tenantid}/v2.0')]
                if not allowed:
                    raise ValueError()
                decoded = jwt.decode(encoded, KeySet.import_key_set({'keys': allowed}), algorithms=['RS256'])
            checked = CodeIDToken(decoded.claims, decoded.header,
                options={'iss': {'essential': True, 'value': claims['iss']},
                         'aud': {'essential': True, 'value': client_id}},
                params={'nonce': transaction['nonce'], 'client_id': client_id, 'access_token': access_token})
            checked.validate(leeway=30)
            if not isinstance(checked['sub'], str) or not checked['sub'] or len(checked['sub']) > 512:
                raise ValueError()
            email = checked.get('email')
            if provider == 'microsoft' and not email:
                # A suggestion only: new Microsoft signup always verifies it in camOS.
                email = checked.get('preferred_username')
            return ProviderIdentity(provider, issuer, checked['sub'],
                email if isinstance(email, str) else None,
                checked.get('name') if isinstance(checked.get('name'), str) else None,
                provider == 'google' and checked.get('email_verified') is True)
        except ProviderError:
            raise
        except Exception:
            raise ProviderError('provider-error', 400) from None

    def exchange(self, provider, code, transaction):
        client_id, secret, callback = self.config(provider)
        try:
            if not code or len(code) > 4096:
                raise ValueError()
            with OAuth2Session(client_id, secret, redirect_uri=callback,
                    token_endpoint_auth_method='client_secret_post') as client:
                token = client.fetch_token(ENDPOINTS[provider][1], code=code,
                    code_verifier=transaction['verifier'], timeout=(3, 10), allow_redirects=False)
            return self.validate(provider, token['id_token'], transaction, token.get('access_token'))
        except ProviderError:
            raise
        except Exception:
            raise ProviderError('provider-error', 400) from None
