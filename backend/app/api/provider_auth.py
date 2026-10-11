"""Provider authentication returns only to existing customer auth surfaces."""

import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from backend.app.auth import set_auth_cookie
from backend.app.services.provider_oidc import ProviderError, LINK_TTL, TRANSACTION_TTL
from backend.app.services.session_tokens import create_session, session_cookie_secure
from backend.app.services.user_lifecycle import SIGNUP, CODE_TTL, CHALLENGE_TTL, RESEND_COOLDOWN
from .organisation_memberships import mutation_origin
from .user_lifecycle import LifecycleRoute, operation, service, deliver, safe_user

logger = logging.getLogger(__name__)
router = APIRouter(route_class=LifecycleRoute)
Provider = Literal['google', 'microsoft']
TRANSACTION_COOKIE = 'camos_oidc_transaction'
LINK_COOKIE = 'camos_provider_link'
SIGNUP_COOKIE = 'camos_provider_signup'
RESULT_COOKIE = 'camos_provider_result'
COOKIE_PATH = '/api/auth'
mutations = [Depends(mutation_origin)]


class CallbackPrivacyMiddleware:
    """Uvicorn reads the scope when logging responses: omit OAuth query secrets."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        async def safe_send(message):
            if (message['type'] == 'http.response.start' and scope.get('path') in (
                    '/api/auth/google/callback', '/api/auth/microsoft/callback')):
                scope['query_string'] = b''
            await send(message)
        await self.app(scope, receive, safe_send)


class StartRequest(BaseModel):
    intent: Literal['login', 'signup']
    model_config = ConfigDict(extra='forbid')


class PasswordRequest(BaseModel):
    password: str = Field(min_length=1, max_length=1024)
    model_config = ConfigDict(extra='forbid')


class CodeRequest(BaseModel):
    code: str = Field(max_length=16)
    model_config = ConfigDict(extra='forbid')


def cookie(response, name, value, ttl):
    response.set_cookie(name, value, path=COOKIE_PATH, max_age=ttl, httponly=True,
                        secure=session_cookie_secure(), samesite='lax')


def clear(response, name):
    response.delete_cookie(name, path=COOKIE_PATH, httponly=True,
                          secure=session_cookie_secure(), samesite='lax')


def clear_provider_cookies(response):
    for name in (TRANSACTION_COOKIE, LINK_COOKIE, SIGNUP_COOKIE, RESULT_COOKIE):
        clear(response, name)


def provider_required(request, user):
    providers = request.app.state.provider_auth.repository.providers(user.id)
    if not providers:
        return JSONResponse({'detail': 'Account sign-in is unavailable. Please contact us.'}, status_code=409)
    return JSONResponse({'error': 'provider_required', 'message': 'Please sign in with your provider.',
                         'providers': providers}, status_code=409)


def run(request, callback):
    try:
        return callback(request.app.state.provider_auth)
    except ProviderError as error:
        messages = {'incorrect-password': 'Incorrect password.',
                    'provider-expired': 'This request expired. Please restart sign-in.',
                    'provider-conflict': 'Unable to connect this account. Please restart sign-in.',
                    'provider-unavailable': 'Provider sign-in is unavailable right now.'}
        raise HTTPException(error.status, messages.get(error.kind, 'Unable to sign in. Please try again.')) from None
    except Exception:
        logger.error('provider.operation_unavailable')
        raise HTTPException(503, 'Sign-in is unavailable right now. Please try again.') from None


def session(response, user):
    token, expires = create_session(user.id, session_version=user.session_version)
    set_auth_cookie(response, token, expires)


@router.post('/api/auth/{provider}/start', dependencies=mutations)
def start(provider: Provider, payload: StartRequest, request: Request):
    url, ticket = run(request, lambda auth: auth.oidc.start(provider, payload.intent))
    response = JSONResponse({'authorization_url': url, 'expiresInSeconds': TRANSACTION_TTL})
    clear_provider_cookies(response)
    cookie(response, TRANSACTION_COOKIE, ticket, TRANSACTION_TTL)
    return response


@router.get('/api/auth/{provider}/callback')
def callback(provider: Provider, request: Request):
    auth = request.app.state.provider_auth
    intent = 'login'
    result = 'provider-error'
    response = None
    try:
        # Duplicate query values are rejected rather than choosing arbitrary input.
        if any(len(request.query_params.getlist(key)) > 1 for key in ('state', 'code', 'error')):
            raise ProviderError('provider-expired')
        transaction = auth.oidc.transaction(provider, request.cookies.get(TRANSACTION_COOKIE, ''),
                                            request.query_params.get('state', ''))
        intent = transaction['intent']
        if request.query_params.get('error'):
            result = 'provider-cancelled' if request.query_params['error'] == 'access_denied' else 'provider-error'
        else:
            identity = auth.oidc.exchange(provider, request.query_params.get('code', ''), transaction)
            decision = auth.resolve(identity, intent)
            result = decision.kind
            if result == 'session':
                response = RedirectResponse('/home', status_code=303)
                session(response, decision.user)
            elif result == 'link':
                ticket = auth.oidc.tickets.seal('link', dict(identity=identity.mapping(),
                    user_id=str(decision.user.id), email=decision.user.email,
                    version=decision.user.session_version, provider=provider, intent=intent), LINK_TTL)
                response = RedirectResponse(('/create-account' if intent == 'signup' else '/login')
                                            + '?auth=confirm-provider', status_code=303)
                cookie(response, LINK_COOKIE, ticket, LINK_TTL)
            elif result == 'verify-email':
                handle, delivery = operation(request, lambda lifecycle: lifecycle.start(SIGNUP, decision.email,
                    username=decision.username, provider_identity=identity.mapping()))
                response = RedirectResponse('/create-account?auth=verify-provider-email', status_code=303)
                cookie(response, SIGNUP_COOKIE, handle, CHALLENGE_TTL)
                try:
                    deliver(service(request), SIGNUP, delivery)
                except HTTPException:
                    # Persisted authority remains available for the existing resend mechanics.
                    response = RedirectResponse('/create-account?auth=verify-provider-email&mail=unavailable', status_code=303)
                    cookie(response, SIGNUP_COOKIE, handle, CHALLENGE_TTL)
            elif result == 'provider-required':
                response = RedirectResponse('/login?auth=provider-required', status_code=303)
                providers = auth.repository.providers(decision.user.id)
                cookie(response, RESULT_COOKIE, auth.oidc.tickets.seal('result', {'providers': providers}, LINK_TTL), LINK_TTL)
    except ProviderError as error:
        result = error.kind
    except Exception:
        # No code, token, identity, secret or provider error text reaches logs.
        logger.warning('provider.callback_unavailable')
        result = 'provider-error'
    if response is None:
        surface = '/create-account' if intent == 'signup' else '/login'
        response = RedirectResponse(surface + '?auth=' + result, status_code=303)
    clear(response, TRANSACTION_COOKIE)
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


@router.get('/api/auth/result')
def result(request: Request):
    value = run(request, lambda auth: auth.oidc.tickets.open('result', request.cookies.get(RESULT_COOKIE, ''), LINK_TTL))
    return {'providers': value['providers']}


@router.get('/api/auth/link')
def link_state(request: Request):
    value = run(request, lambda auth: auth.oidc.tickets.open('link', request.cookies.get(LINK_COOKIE, ''), LINK_TTL))
    return {'provider': value['provider'], 'intent': value['intent'],
            'expiresInSeconds': max(0, int(value['expires'] - time.time()))}


@router.post('/api/auth/link', dependencies=mutations)
def confirm_link(payload: PasswordRequest, request: Request, response: Response):
    def confirm(auth):
        value = auth.oidc.tickets.open('link', request.cookies.get(LINK_COOKIE, ''), LINK_TTL)
        return auth.confirm(value, payload.password)
    user = run(request, confirm)
    session(response, user)
    clear_provider_cookies(response)
    return safe_user(user)


@router.delete('/api/auth/link', status_code=204, dependencies=mutations)
def cancel_link(response: Response):
    clear(response, LINK_COOKIE)


@router.get('/api/auth/signup')
def signup_state(request: Request):
    return operation(request, lambda lifecycle: lifecycle.signup_context(request.cookies.get(SIGNUP_COOKIE, '')))


@router.post('/api/auth/signup/resend', dependencies=mutations)
def signup_resend(request: Request):
    delivery = operation(request, lambda lifecycle: lifecycle.resend(SIGNUP,
        request.cookies.get(SIGNUP_COOKIE, ''), provider_signup=True))
    deliver(service(request), SIGNUP, delivery)
    return {'ok': True, 'expiresInSeconds': CODE_TTL, 'resendCooldownSeconds': RESEND_COOLDOWN}


@router.post('/api/auth/signup/verify', dependencies=mutations)
def signup_verify(payload: CodeRequest, request: Request, response: Response):
    user = operation(request, lambda lifecycle: lifecycle.verify(SIGNUP,
        request.cookies.get(SIGNUP_COOKIE, ''), payload.code.strip(), provider_signup=True))
    session(response, user)
    clear_provider_cookies(response)
    return safe_user(user)


@router.delete('/api/auth/signup', status_code=204, dependencies=mutations)
def cancel_signup(request: Request, response: Response):
    # Pending rows expire through the existing bounded lifecycle cleanup.
    clear(response, SIGNUP_COOKIE)
