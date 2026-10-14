"""Customer email family and separate operational notifications through Postmark."""

from __future__ import annotations

import base64
import json
import logging
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from html import escape
from pathlib import Path
from datetime import datetime
from uuid import UUID
from urllib import error, request

DEFAULT_POSTMARK_EMAIL_ENDPOINT = "https://api.postmarkapp.com/email"

logger = logging.getLogger(__name__)


class PostmarkConfigurationError(RuntimeError):
    """Raised when required Postmark env vars are missing."""


class PostmarkDeliveryError(RuntimeError):
    """Raised when Postmark rejects or fails to deliver an email."""

    def __init__(
        self,
        *,
        status_code: int | None,
        response_body: str,
        error_code: int | None,
        error_message: str | None,
        from_email: str,
        to_email_masked: str,
        uncertain: bool | None = None,
    ):
        self.status_code = status_code
        self.response_body = response_body
        self.error_code = error_code
        self.error_message = error_message
        self.from_email = from_email
        self.to_email_masked = to_email_masked
        self.uncertain = uncertain if uncertain is not None else status_code is None or status_code >= 500 or status_code == 200
        super().__init__(
            f"Postmark send failed status={status_code} error_code={error_code} message={error_message}"
        )


@dataclass(frozen=True)
class PostmarkConfig:
    server_token: str
    from_email: str
    endpoint: str


@dataclass(frozen=True)
class PostmarkSendResult:
    message_id: str | None
    submitted_at: str | None
    to_email_masked: str


@dataclass(frozen=True)
class PostmarkAttachment:
    name: str
    content_base64: str
    content_type: str


def _mask_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = f"{local[:1]}***"
    else:
        masked_local = f"{local[:2]}***"
    return f"{masked_local}@{domain}"


def _parse_postmark_error(body: str) -> tuple[int | None, str | None]:
    try:
        data = json.loads(body)
        error_code = data.get("ErrorCode")
        message = data.get("Message")
        return (
            int(error_code) if isinstance(error_code, int) else None,
            message if isinstance(message, str) else None,
        )
    except Exception:
        return None, None


def _load_config() -> PostmarkConfig:
    server_token = os.getenv("POSTMARK_SERVER_TOKEN", "").strip()
    from_email = os.getenv("POSTMARK_FROM_EMAIL", "").strip()
    missing = [
        name
        for name, value in (
            ("POSTMARK_SERVER_TOKEN", server_token),
            ("POSTMARK_FROM_EMAIL", from_email),
        )
        if not value
    ]
    if missing:
        joined = ", ".join(missing)
        raise PostmarkConfigurationError(
            f"Email service is not configured. Missing {joined}."
        )
    return PostmarkConfig(
        server_token=server_token,
        from_email=from_email,
        endpoint=(
            os.getenv("POSTMARK_EMAIL_ENDPOINT", DEFAULT_POSTMARK_EMAIL_ENDPOINT).strip()
            or DEFAULT_POSTMARK_EMAIL_ENDPOINT
        ),
    )


DEFAULT_ADMIN_NOTIFY_EMAIL = "ali@camos.app"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _admin_notify_recipients() -> list[str]:
    """Return admin notification recipients, always including Ali.

    ADMIN_NOTIFY_EMAIL may add extra recipients, but it cannot replace the
    production-required Ali notification target. Invalid entries are ignored so
    an optional override cannot break internal notifications.
    """
    recipients: list[str] = [DEFAULT_ADMIN_NOTIFY_EMAIL]
    configured = os.getenv("ADMIN_NOTIFY_EMAIL", "")
    for candidate in re.split(r"[,;]", configured):
        email = candidate.strip()
        if not email:
            continue
        if not EMAIL_RE.match(email):
            logger.warning("postmark.admin_notify.invalid_recipient_ignored")
            continue
        if email.lower() not in {item.lower() for item in recipients}:
            recipients.append(email)
    return recipients


def _require_admin_notify_email() -> str:
    return ", ".join(_admin_notify_recipients())


def _postmark_send(
    *, token: str, payload: dict, from_email: str, to_email: str, endpoint: str
) -> PostmarkSendResult:
    # Leave MIME/header overhead below the provider's complete 10 MB limit.
    encoded = json.dumps(payload).encode('utf-8')
    if len(encoded) + 65536 > 10_000_000:
        raise PostmarkDeliveryError(status_code=None, response_body='', error_code=None,
            error_message='Message exceeds provider envelope', from_email=from_email, to_email_masked=_mask_email(to_email), uncertain=False)
    req = request.Request(endpoint, data=encoded, headers={
        'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token,
    }, method='POST')
    masked = _mask_email(to_email)
    def failed(status, code=None, *, uncertain=None):
        logger.error('postmark.send.failed provider=postmark status=%s category=%s', status, code)
        return PostmarkDeliveryError(status_code=status, response_body='', error_code=code,
            error_message='Email delivery failed', from_email=from_email, to_email_masked=masked, uncertain=uncertain)
    try:
        with request.urlopen(req, timeout=10) as response:
            body = response.read(65537)
            if response.status != 200 or len(body) > 65536:
                raise failed(response.status)
            try:
                data = json.loads(body)
                if isinstance(data, dict) and type(data.get('ErrorCode')) is int and data['ErrorCode'] > 0:
                    raise failed(response.status, data['ErrorCode'], uncertain=False)
                if (not isinstance(data, dict) or type(data.get('ErrorCode')) is not int or data['ErrorCode'] != 0
                        or any(not isinstance(data.get(k), str) or not data[k] for k in ('MessageID', 'SubmittedAt', 'Message', 'To'))):
                    raise ValueError()
                UUID(data['MessageID'])
                if datetime.fromisoformat(data['SubmittedAt'].replace('Z', '+00:00')).tzinfo is None:
                    raise ValueError()
            except (ValueError, TypeError, KeyError):
                raise failed(response.status) from None
            logger.info('postmark.send.success provider=postmark message_id=%s', data['MessageID'])
            return PostmarkSendResult(data['MessageID'], data['SubmittedAt'], masked)
    except error.HTTPError as exc:
        code, _ = _parse_postmark_error(exc.read(65536).decode('utf-8', errors='replace'))
        raise failed(exc.code, code) from None
    except (error.URLError, TimeoutError, OSError):
        raise failed(None) from None


def send_admin_signup_notification(
    *,
    verified_email: str,
    name: str,
    username: str,
    timestamp: str,
    phone: str | None = None,
    source: str = "Signup verification",
) -> PostmarkSendResult:
    config = _load_config()
    admin_notify_email = _require_admin_notify_email()
    logger.info(
        "postmark.admin_signup.trigger_start to_email=%s signup_email=%s source=%s",
        _mask_email(admin_notify_email),
        _mask_email(verified_email),
        source,
    )
    environment = (
        os.getenv("REACT_APP_ENVIRONMENT")
        or os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or os.getenv("RAILWAY_ENVIRONMENT")
        or "Not provided"
    )
    payload = {
        "From": config.from_email,
        "To": admin_notify_email,
        "Subject": "New camOS Signup",
        "TextBody": (
            "A new camOS user has completed signup.\n\n"
            f"Name: {name or 'Not provided'}\n"
            f"Email: {verified_email}\n"
            "Company: Not captured\n"
            f"Signup timestamp (UTC): {timestamp}\n"
            f"Environment: {environment}\n\n"
            "Additional captured signup fields:\n"
            f"Username: {username}\n"
            f"Phone: {phone if phone else 'Not provided'}\n"
            f"Source: {source}\n"
        ),
    }
    return _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=admin_notify_email,
        endpoint=config.endpoint,
    )


def send_admin_contact_notification(
    *,
    name: str,
    email: str,
    phone: str | None,
    message: str,
    submitted_at: str,
    attachment_names: list[str],
    company: str | None = None,
    page_url: str | None = None,
    attachments: list[PostmarkAttachment] | None = None,
) -> PostmarkSendResult:
    config = _load_config()
    admin_notify_email = _require_admin_notify_email()
    logger.info(
        "postmark.admin_contact.trigger_start to_email=%s contact_email=%s attachments=%s",
        _mask_email(admin_notify_email),
        _mask_email(email),
        len(attachment_names),
    )
    attachments_line = ", ".join(attachment_names) if attachment_names else "None"
    page_url_line = page_url if page_url else "Not supplied"
    company_line = company if company else "Not supplied"
    payload = {
        "From": config.from_email,
        "To": admin_notify_email,
        "Subject": "New camOS Contact Request",
        "TextBody": (
            "A new camOS Contact Us submission has been received.\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n"
            f"Phone: {phone if phone else 'Not supplied'}\n"
            f"Organisation: {company_line}\n"
            f"Submission timestamp (UTC): {submitted_at}\n"
            f"Page URL / context: {page_url_line}\n"
            f"Attachments: {attachments_line}\n\n"
            "Message:\n"
            f"{message}\n"
        ),
    }

    if attachments:
        payload["Attachments"] = [
            {
                "Name": item.name,
                "Content": item.content_base64,
                "ContentType": item.content_type,
            }
            for item in attachments
        ]

    return _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=admin_notify_email,
        endpoint=config.endpoint,
    )


# Customer brand/legal ownership stays here; operational emails above bypass it.
COMPANY_NAME = "Camera Operating Systems Limited"
COMPANY_ADDRESS = "71-75 Shelton Street, Covent Garden, London, WC2H 9FD, England"
COMPANY_NUMBER = "Registered Company Number: 16937639"
EMAIL_LEGAL_TEXT = (
    "This message contains confidential information and is intended only for the individual named. "
    "If you are not the intended recipient of this email please notify the sender immediately, "
    "delete this e-mail from your system and do not use it in any way. We cannot guarantee this "
    "message is virus free or has not been intercepted and amended. Unless stated to the contrary, "
    "any opinions expressed in this message are personal and may not be attributed to Camera Operating Systems."
)
LOGO_CID = "camos-logo"


@lru_cache(maxsize=1)
def _cached_logo_attachment() -> dict:
    return {
        "Name": "camos-logo.png",
        "Content": base64.b64encode(Path(__file__).with_name("camos-logo.png").read_bytes()).decode("ascii"),
        "ContentType": "image/png",
        "ContentID": f"cid:{LOGO_CID}",
    }


def _paragraph(text: str) -> str:
    return f'<p style="margin:0 0 20px;line-height:24px;">{escape(text).replace(chr(10), "<br>")}</p>'


def _code_block(code: str, label: str = "Verification code") -> str:
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="margin:4px 0 24px;border:1px solid #c2cbd6;background:#fbfbf8;"><tr>'
        '<td align="center" style="padding:20px 12px;">'
        f'<p style="margin:0 0 8px;color:#5e6876;font-size:13px;">{escape(label)}</p>'
        '<p style="margin:0;color:#16181b;font-family:Consolas,\'Courier New\',monospace;'
        f'font-size:36px;line-height:44px;letter-spacing:4px;">{escape(code)}</p>'
        '<p style="margin:8px 0 0;color:#5e6876;font-size:13px;">Expires in 15 minutes</p>'
        '</td></tr></table>'
    )


def _render_customer_email(*, title: str, preheader: str, body_html: str, body_text: str) -> tuple[str, str]:
    """body_html is assembled only by the escaped, purpose-specific functions below."""
    footer_text = f"{EMAIL_LEGAL_TEXT}\n\n{COMPANY_NAME}\n{COMPANY_ADDRESS}\n\n{COMPANY_NUMBER}"
    legal_html = (
        f'<p style="margin:0 0 16px;">{escape(EMAIL_LEGAL_TEXT)}</p>'
        f'<p style="margin:0 0 8px;">{escape(COMPANY_NAME)}</p>'
        f'<p style="margin:0 0 16px;">{escape(COMPANY_ADDRESS)}</p>'
        f'<p style="margin:0;">{escape(COMPANY_NUMBER)}</p>'
    )
    html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title>
<style>@media screen and (max-width:620px){{.camos-content{{padding:24px 20px!important}}.camos-page{{padding:12px 0!important}}}}</style>
</head><body style="margin:0;padding:0;background:#f7f7f3;color:#39414a;font-family:Arial,'Segoe UI',sans-serif;font-size:16px;line-height:24px;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f7f3"><tr><td class="camos-page" align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #c2cbd6;">
<tr><td class="camos-content" style="padding:32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="center" style="padding:0 0 28px;"><img src="cid:{LOGO_CID}" width="72" height="72" alt="camOS" style="display:block;border:0;"></td>
</tr><tr><td style="border-top:1px solid #c2cbd6;font-size:0;line-height:0;">&nbsp;</td></tr></table>
<h1 style="margin:20px 0;font-size:28px;line-height:34px;font-weight:bold;color:#16181b;">{escape(title)}</h1>
{body_html}
<p style="margin:28px 0 0;line-height:24px;">camOS Team<br><span style="color:#5e6876;font-size:14px;">Camera Operating Systems</span></p>
</td></tr><tr><td class="camos-content" style="padding:24px 32px;border-top:1px solid #c2cbd6;color:#5e6876;font-size:12px;line-height:18px;overflow-wrap:anywhere;">
{legal_html}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>'''
    text = f"camOS\n----\n\n{title}\n\n{body_text}\n\ncamOS Team\nCamera Operating Systems\n\n---\n{footer_text}\n"
    return html, text


def _send_customer_email(*, to_email: str, subject: str, title: str, preheader: str,
                         body_html: str, body_text: str) -> PostmarkSendResult:
    config = _load_config()
    html, text = _render_customer_email(title=title, preheader=preheader, body_html=body_html, body_text=body_text)
    return _postmark_send(
        token=config.server_token, from_email=config.from_email, to_email=to_email, endpoint=config.endpoint,
        payload={"From": config.from_email, "To": to_email, "Subject": subject,
                 "HtmlBody": html, "TextBody": text, "Attachments": [_cached_logo_attachment()]},
    )


def send_verification_email(*, to_email: str, code: str) -> PostmarkSendResult:
    explanation = "Use the verification code below to finish creating your camOS account."
    next_step = "Enter this code in the verification screen to continue account creation."
    security = "If you did not create a camOS account, you can ignore this email."
    return _send_customer_email(
        to_email=to_email, subject="Verify your camOS email", title="Verify your email",
        preheader="Use this code to finish creating your camOS account.",
        body_html=_paragraph(explanation) + _code_block(code) + _paragraph(next_step) + _paragraph(security),
        body_text=f"{explanation}\n\nVerification code:\n{code}\n\nExpires in 15 minutes\n\n{next_step}\n\n{security}",
    )


def send_password_reset_code_email(*, to_email: str, code: str) -> PostmarkSendResult:
    explanation = "We received a request to reset the password for your camOS account."
    next_step = "Enter this code in the reset screen, then choose your new password."
    security = "If you did not request this reset, you can safely ignore this email."
    return _send_customer_email(
        to_email=to_email, subject="Reset your camOS password", title="Reset your password",
        preheader="Use this code to reset your camOS password.",
        body_html=_paragraph(explanation) + _code_block(code, "Password reset code") + _paragraph(next_step)
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid #9b7420;padding-left:16px;">'
        + _paragraph(security) + '</td></tr></table>',
        body_text=f"{explanation}\n\nPassword reset code:\n{code}\n\nExpires in 15 minutes\n\n{next_step}\n\n{security}",
    )


def send_settings_unlock_code_email(*, to_email: str, code: str) -> PostmarkSendResult:
    explanation = "Use this code to continue making changes to your camOS account."
    next_step = "Return to the account confirmation screen to continue."
    security = "If you did not initiate this action, do not use the code."
    return _send_customer_email(
        to_email=to_email, subject="Confirm your camOS account changes", title="Confirm it's you",
        preheader="Confirm it's you before continuing your account changes.",
        body_html=_paragraph(explanation) + _code_block(code, "Account confirmation code")
        + _paragraph(next_step) + '<p style="margin:0;color:#16181b;font-weight:bold;line-height:24px;">' + escape(security) + '</p>',
        body_text=f"{explanation}\n\nAccount confirmation code:\n{code}\n\nExpires in 15 minutes\n\n{next_step}\n\n{security}",
    )


def send_contact_confirmation_email(*, to_email: str, name: str, message: str | None = None) -> PostmarkSendResult:
    greeting = f"Hi {name.strip()}," if name.strip() else "Hello,"
    receipt = "We've received your message and a member of the camOS team will review it shortly."
    response_time = "You can expect to hear from us within 24 hours."
    message_html = message_text = ""
    if message and message.strip():
        message_text = f"\n\nYour message:\n{message.strip()}"
        message_html = (
            '<h2 style="margin:28px 0 12px;font-size:16px;line-height:24px;color:#16181b;">Your message</h2>'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>'
            '<td style="padding:20px;background:#fbfbf8;border:1px solid #c2cbd6;overflow-wrap:anywhere;word-break:break-word;">'
            + _paragraph(message.strip()) + '</td></tr></table>'
        )
    return _send_customer_email(
        to_email=to_email, subject="We've received your message", title="Thanks for getting in touch",
        preheader="We've received your message and will respond within 24 hours.",
        body_html=_paragraph(greeting) + _paragraph(receipt) + _paragraph(response_time) + message_html,
        body_text=f"{greeting}\n\n{receipt}\n\n{response_time}{message_text}",
    )
