"""Canonical signup, recovery and password-plus-email account unlock routes."""

import logging
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse

from backend.app.auth import get_canonical_user, set_auth_cookie
from backend.app.models import (
    AuthUser, AuthUserResponse, CreateAccountRequest, SignupStartResponse,
    SignupResendRequest, SignupResendResponse, SignupVerifyRequest,
    PasswordResetStartRequest, PasswordResetStartResponse, PasswordResetResendRequest,
    PasswordResetResendResponse, PasswordResetVerifyRequest, PasswordResetVerifyResponse,
    PasswordResetSetPasswordRequest, PasswordResetSetPasswordResponse,
    SettingsUnlockStartRequest, SettingsUnlockStartResponse, SettingsUnlockResendResponse,
    SettingsUnlockVerifyRequest, SettingsUnlockVerifyResponse, UpdateMeRequest,
)
from backend.app.services import passwords, postmark_email
from backend.app.services.session_tokens import create_session
from backend.app.services.user_lifecycle import (
    CODE_TTL, CHALLENGE_TTL, RESEND_COOLDOWN, VERIFIED_TTL, SIGNUP, RESET, UNLOCK,
)
from backend.app.services.user_lifecycle_repository import LifecycleError
from .organisation_memberships import mutation_origin

logger = logging.getLogger(__name__)
COOKIE_NAMES = {SIGNUP: 'camos_signup_challenge', RESET: 'camos_reset_challenge', UNLOCK: 'camos_unlock_challenge'}
COOKIE_PATHS = {SIGNUP: '/api/signup', RESET: '/api/password-reset', UNLOCK: '/api'}


class LifecycleRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request):
            try:
                response = await handler(request)
            except HTTPException as error:
                error.headers = {**(error.headers or {}), 'Cache-Control': 'no-store'}
                raise
            except RequestValidationError as error:
                # Pydantic error input can contain passwords/codes. Never echo it.
                response = JSONResponse(status_code=422, content={'detail': [
                    {key: item[key] for key in ('loc', 'msg', 'type')} for item in error.errors()
                ]})
            response.headers['Cache-Control'] = 'no-store'
            return response

        return handle


router = APIRouter(route_class=LifecycleRoute)
mutations = [Depends(mutation_origin)]


def service(request):
    value = getattr(request.app.state, 'user_lifecycle', None)
    if value is None:
        raise HTTPException(503, 'Account lifecycle is unavailable in this backend mode.')
    return value


def operation(request, callback):
    lifecycle = service(request)
    try:
        return callback(lifecycle)
    except LifecycleError as error:
        raise HTTPException(error.status, error.message) from None
    except HTTPException:
        raise
    except Exception:
        # Driver exceptions can include SQL parameters. Do not log their text.
        logger.error('account.storage_unavailable')
        raise HTTPException(503, 'Account service unavailable. Please try again.') from None
    finally:
        lifecycle.cleanup_expired()


def challenge_handle(request, purpose):
    return request.cookies.get(COOKIE_NAMES[purpose], '')


def lifecycle_cookie(response, purpose, value, *, expires=None):
    import os
    name = COOKIE_NAMES[purpose]
    secure = os.getenv('PORTAL_SESSION_SECURE', '').lower() == 'true' or (
        not os.getenv('PORTAL_SESSION_SECURE') and os.getenv('NODE_ENV') == 'production')
    response.set_cookie(name, value, httponly=True, secure=secure, samesite='strict',
                        path=COOKIE_PATHS[purpose], max_age=expires or CHALLENGE_TTL)


def clear_lifecycle_cookie(response, purpose):
    name = COOKIE_NAMES[purpose]
    response.delete_cookie(name, path=COOKIE_PATHS[purpose])


def deliver(lifecycle, purpose, delivery):
    if delivery is None:
        return
    try:
        lifecycle.deliver(purpose, *delivery[:2])
    except Exception:
        logger.warning('account.email_unavailable purpose=%s', purpose)
        # Recovery acknowledgement must not identify eligible accounts through
        # provider errors. Its persisted challenge can be resent safely.
        if purpose != RESET:
            raise HTTPException(502, 'Unable to send verification email. Please try resend.') from None


def safe_user(user):
    return AuthUserResponse(user=AuthUser(id=str(user.id), name=user.username,
        email=user.email, phone=user.phone_number))


@router.post('/api/signup/start', response_model=SignupStartResponse, status_code=202, dependencies=mutations)
def signup_start(payload: CreateAccountRequest, request: Request, response: Response):
    handle, delivery = operation(request, lambda lifecycle: lifecycle.start(SIGNUP, payload.email,
        username=payload.name, phone=payload.phone, password=payload.password))
    lifecycle_cookie(response, SIGNUP, handle)
    # Cookie must survive delivery errors so resend can recover without a new
    # password submission. Return the same response object on that path.
    try:
        deliver(service(request), SIGNUP, delivery)
    except HTTPException as error:
        response.status_code = error.status_code
        return JSONResponse({'detail': error.detail}, status_code=error.status_code,
                            headers=dict(response.headers))
    return SignupStartResponse(ok=True, email=delivery[0], expiresInSeconds=CODE_TTL,
                               resendCooldownSeconds=RESEND_COOLDOWN)


@router.post('/api/signup/resend', response_model=SignupResendResponse, dependencies=mutations)
def signup_resend(payload: SignupResendRequest, request: Request):
    delivery = operation(request, lambda lifecycle: lifecycle.resend(SIGNUP, challenge_handle(request, SIGNUP)))
    deliver(service(request), SIGNUP, delivery)
    return SignupResendResponse(ok=True, expiresInSeconds=CODE_TTL,
        resendCooldownSeconds=RESEND_COOLDOWN, resendsRemaining=delivery[2])


@router.post('/api/signup/verify', response_model=AuthUserResponse, status_code=201, dependencies=mutations)
def signup_verify(payload: SignupVerifyRequest, request: Request, response: Response):
    user = operation(request, lambda lifecycle: lifecycle.verify(SIGNUP,
        challenge_handle(request, SIGNUP), payload.code.strip()))
    clear_lifecycle_cookie(response, SIGNUP)
    try:
        postmark_email.send_admin_signup_notification(verified_email=user.email, name=user.username,
            username=user.username, timestamp=datetime.now(timezone.utc).isoformat(), phone=user.phone_number)
    except Exception:
        logger.warning('account.admin_notification_failed user_id=%s', user.id)
    return safe_user(user)


@router.post('/api/password-reset/start', response_model=PasswordResetStartResponse, status_code=202, dependencies=mutations)
def password_reset_start(payload: PasswordResetStartRequest, request: Request, response: Response):
    handle, delivery = operation(request, lambda lifecycle: lifecycle.start(RESET, payload.email))
    lifecycle_cookie(response, RESET, handle)
    deliver(service(request), RESET, delivery)
    return PasswordResetStartResponse(ok=True, email=payload.email.strip().lower(),
        expiresInSeconds=CODE_TTL, resendCooldownSeconds=RESEND_COOLDOWN)


@router.post('/api/password-reset/resend', response_model=PasswordResetResendResponse, dependencies=mutations)
def password_reset_resend(payload: PasswordResetResendRequest, request: Request):
    try:
        delivery = operation(request, lambda lifecycle: lifecycle.resend(RESET, challenge_handle(request, RESET)))
    except HTTPException as error:
        if error.status_code == 503:
            raise
        delivery = None
    deliver(service(request), RESET, delivery)
    return PasswordResetResendResponse(ok=True, expiresInSeconds=CODE_TTL,
        resendCooldownSeconds=RESEND_COOLDOWN, resendsRemaining=5)


@router.post('/api/password-reset/verify-code', response_model=PasswordResetVerifyResponse, dependencies=mutations)
def password_reset_verify(payload: PasswordResetVerifyRequest, request: Request, response: Response):
    operation(request, lambda lifecycle: lifecycle.verify(RESET,
        challenge_handle(request, RESET), payload.code.strip()))
    lifecycle_cookie(response, RESET, challenge_handle(request, RESET), expires=VERIFIED_TTL[RESET])
    return PasswordResetVerifyResponse(ok=True, resetExpiresInSeconds=VERIFIED_TTL[RESET])


@router.post('/api/password-reset/set-password', response_model=PasswordResetSetPasswordResponse, dependencies=mutations)
def password_reset_set_password(payload: PasswordResetSetPasswordRequest, request: Request, response: Response):
    operation(request, lambda lifecycle: lifecycle.reset_password(challenge_handle(request, RESET),
        payload.password, payload.confirm_password))
    clear_lifecycle_cookie(response, RESET)
    return PasswordResetSetPasswordResponse(ok=True)


@router.post('/api/settings/unlock/start', response_model=SettingsUnlockStartResponse, dependencies=mutations)
def settings_unlock_start(payload: SettingsUnlockStartRequest, request: Request, response: Response,
                          user=Depends(get_canonical_user)):
    def start(lifecycle):
        if not passwords.verify_password(payload.current_password, user.password_hash):
            raise LifecycleError(401, 'Incorrect password')
        return lifecycle.start(UNLOCK, user.email, user=user)
    handle, delivery = operation(request, start)
    lifecycle_cookie(response, UNLOCK, handle)
    try:
        deliver(service(request), UNLOCK, delivery)
    except HTTPException as error:
        return JSONResponse({'detail': error.detail}, status_code=error.status_code,
                            headers=dict(response.headers))
    return SettingsUnlockStartResponse(ok=True, expiresInSeconds=CODE_TTL,
        resendCooldownSeconds=RESEND_COOLDOWN)


@router.post('/api/settings/unlock/resend', response_model=SettingsUnlockResendResponse, dependencies=mutations)
def settings_unlock_resend(request: Request, user=Depends(get_canonical_user)):
    delivery = operation(request, lambda lifecycle: lifecycle.resend(UNLOCK, challenge_handle(request, UNLOCK),
        user))
    deliver(service(request), UNLOCK, delivery)
    return SettingsUnlockResendResponse(ok=True, expiresInSeconds=CODE_TTL,
        resendCooldownSeconds=RESEND_COOLDOWN, resendsRemaining=delivery[2])


@router.post('/api/settings/unlock/verify', response_model=SettingsUnlockVerifyResponse, dependencies=mutations)
def settings_unlock_verify(payload: SettingsUnlockVerifyRequest, request: Request, user=Depends(get_canonical_user)):
    handle = operation(request, lambda lifecycle: lifecycle.verify(UNLOCK, challenge_handle(request, UNLOCK),
        payload.code.strip(), user))
    return SettingsUnlockVerifyResponse(ok=True, unlockToken=handle,
        unlockExpiresInSeconds=VERIFIED_TTL[UNLOCK])


@router.put('/api/me', response_model=AuthUserResponse, dependencies=mutations)
def update_me(payload: UpdateMeRequest, request: Request, response: Response, user=Depends(get_canonical_user)):
    fields = payload.model_dump(exclude_unset=True, exclude={'unlock_token'})
    handle = challenge_handle(request, UNLOCK)
    if not handle or not hmac.compare_digest(handle, payload.unlock_token):
        raise HTTPException(401, 'Unlock required')
    updated = operation(request, lambda lifecycle: lifecycle.update_account(user, handle, fields))
    if updated.session_version != user.session_version:
        token, expires = create_session(updated.id, session_version=updated.session_version)
        set_auth_cookie(response, token, expires)
        clear_lifecycle_cookie(response, UNLOCK)
    return safe_user(updated)


@router.post('/api/settings/unlock/end', status_code=204, dependencies=mutations)
def end_settings_unlock(request: Request, response: Response, user=Depends(get_canonical_user)):
    operation(request, lambda lifecycle: lifecycle.end_unlock(user, challenge_handle(request, UNLOCK)))
    clear_lifecycle_cookie(response, UNLOCK)


@router.post('/api/create-account', dependencies=mutations)
@router.post('/api/password-reset/verify', dependencies=mutations)
def retired_lifecycle_route():
    raise HTTPException(410, 'This endpoint is retired. Please use the current account flow.')
