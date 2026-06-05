import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from backend.app.api import auth
from backend.app.services.postmark_email import PostmarkConfigurationError


@pytest.mark.anyio
async def test_contact_submission_requires_email_pipeline_and_persists_when_unconfigured(tmp_path, monkeypatch):
    submissions_file = tmp_path / "contact_submissions.json"
    monkeypatch.setattr(auth, "CONTACT_SUBMISSIONS_FILE", str(submissions_file))

    def fail_admin_notification(**_kwargs):
        raise PostmarkConfigurationError(
            "Email service is not configured. Missing POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL."
        )

    monkeypatch.setattr(auth, "send_admin_contact_notification", fail_admin_notification)
    monkeypatch.setattr(auth, "send_contact_confirmation_email", lambda **_kwargs: None)

    with pytest.raises(HTTPException) as exc_info:
        await auth.submit_contact(
            name="Fallback User",
            email="fallback@example.com",
            phone=None,
            message="Please contact me.",
            attachments=[],
        )

    assert exc_info.value.status_code == 503

    submissions = json.loads(Path(submissions_file).read_text())
    assert len(submissions) == 1
    assert submissions[0]["name"] == "Fallback User"
    assert submissions[0]["email"] == "fallback@example.com"
    assert submissions[0]["phone"] is None
    assert submissions[0]["message"] == "Please contact me."
    assert submissions[0]["attachments"] == []


@pytest.mark.anyio
async def test_contact_submission_sends_internal_and_confirmation_emails(tmp_path, monkeypatch):
    submissions_file = tmp_path / "contact_submissions.json"
    monkeypatch.setattr(auth, "CONTACT_SUBMISSIONS_FILE", str(submissions_file))
    calls = []

    class Result:
        def __init__(self, message_id):
            self.message_id = message_id

    def capture_admin(**kwargs):
        calls.append(("admin", kwargs))
        return Result("admin-message-id")

    def capture_confirmation(**kwargs):
        calls.append(("confirmation", kwargs))
        return Result("confirmation-message-id")

    monkeypatch.setattr(auth, "send_admin_contact_notification", capture_admin)
    monkeypatch.setattr(auth, "send_contact_confirmation_email", capture_confirmation)

    response = await auth.submit_contact(
        name="Phone User",
        email="phone@example.com",
        phone="+15551234567",
        message="Please call me.",
        attachments=[],
    )

    assert response.message == "Thanks for contacting us. We'll be in touch soon."
    assert [kind for kind, _ in calls] == ["admin", "confirmation"]
    assert calls[0][1]["name"] == "Phone User"
    assert calls[0][1]["email"] == "phone@example.com"
    assert calls[0][1]["phone"] == "+15551234567"
    assert calls[0][1]["message"] == "Please call me."
    assert calls[0][1]["submitted_at"]
    assert calls[1][1] == {"to_email": "phone@example.com", "name": "Phone User"}

    submissions = json.loads(Path(submissions_file).read_text())
    assert submissions[0]["phone"] == "+15551234567"


@pytest.mark.anyio
async def test_signup_verify_completes_when_admin_notification_fails(tmp_path, monkeypatch):
    users_file = tmp_path / "users.json"
    pending_file = tmp_path / "pending_signups.json"
    monkeypatch.setattr(
        auth,
        "load_users",
        lambda: json.loads(users_file.read_text()) if users_file.exists() else {},
    )
    monkeypatch.setattr(auth, "save_users", lambda users: users_file.write_text(json.dumps(users)))
    monkeypatch.setattr(auth, "load_pending_signups", lambda: json.loads(pending_file.read_text()))
    monkeypatch.setattr(
        auth,
        "save_pending_signups",
        lambda pending: pending_file.write_text(json.dumps(pending)),
    )

    code = "123456"
    email = "signup@example.com"
    now = auth._utc_now()
    pending_file.write_text(
        json.dumps(
            {
                email: {
                    "name": "Signup User",
                    "email": email,
                    "phone": "+15551234567",
                    "password_hash": auth.hash_password("Password123!"),
                    "verification_code_hash": auth.hash_password(code),
                    "code_expires_at": auth._to_iso(
                        now + auth.timedelta(seconds=auth.SIGNUP_CODE_TTL_SECONDS)
                    ),
                    "verify_attempts": 0,
                    "resend_count": 0,
                    "last_code_sent_at": auth._to_iso(now),
                    "created_at": auth._to_iso(now),
                    "updated_at": auth._to_iso(now),
                }
            }
        )
    )

    def fail_admin_notification(**_kwargs):
        raise PostmarkConfigurationError("Admin notification is unavailable")

    monkeypatch.setattr(auth, "send_admin_signup_notification", fail_admin_notification)

    response = await auth.signup_verify(auth.SignupVerifyRequest(email=email, code=code))

    assert response.user.email == email
    users = json.loads(users_file.read_text())
    assert any(user["email"] == email for user in users.values())
    assert json.loads(pending_file.read_text()) == {}


@pytest.mark.anyio
async def test_contact_submission_rejects_invalid_email(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "CONTACT_SUBMISSIONS_FILE", str(tmp_path / "contact_submissions.json"))

    with pytest.raises(HTTPException) as exc_info:
        await auth.submit_contact(
            name="Invalid User",
            email="not-an-email",
            phone=None,
            message="Invalid.",
            attachments=[],
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Not a valid email address"
