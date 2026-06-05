import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from backend.app.api import auth
from backend.app.services.postmark_email import PostmarkConfigurationError


@pytest.mark.anyio
async def test_contact_submission_succeeds_and_persists_when_email_is_unconfigured(tmp_path, monkeypatch):
    submissions_file = tmp_path / "contact_submissions.json"
    monkeypatch.setattr(auth, "CONTACT_SUBMISSIONS_FILE", str(submissions_file))

    def fail_admin_notification(**_kwargs):
        raise PostmarkConfigurationError(
            "Email service is not configured. Missing POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL."
        )

    monkeypatch.setattr(auth, "send_admin_contact_notification", fail_admin_notification)
    monkeypatch.setattr(auth, "send_contact_confirmation_email", lambda **_kwargs: None)

    response = await auth.submit_contact(
        name="Fallback User",
        email="fallback@example.com",
        phone=None,
        message="Please contact me.",
        attachments=[],
    )

    assert response.message == "Thanks for contacting us. We'll be in touch soon."

    submissions = json.loads(Path(submissions_file).read_text())
    assert len(submissions) == 1
    assert submissions[0]["name"] == "Fallback User"
    assert submissions[0]["email"] == "fallback@example.com"
    assert submissions[0]["phone"] is None
    assert submissions[0]["message"] == "Please contact me."
    assert submissions[0]["attachments"] == []


@pytest.mark.anyio
async def test_contact_submission_persists_optional_phone(tmp_path, monkeypatch):
    submissions_file = tmp_path / "contact_submissions.json"
    monkeypatch.setattr(auth, "CONTACT_SUBMISSIONS_FILE", str(submissions_file))
    monkeypatch.setattr(auth, "send_admin_contact_notification", lambda **_kwargs: None)
    monkeypatch.setattr(auth, "send_contact_confirmation_email", lambda **_kwargs: None)

    response = await auth.submit_contact(
        name="Phone User",
        email="phone@example.com",
        phone="+15551234567",
        message="Please call me.",
        attachments=[],
    )

    assert response.message == "Thanks for contacting us. We'll be in touch soon."

    submissions = json.loads(Path(submissions_file).read_text())
    assert submissions[0]["phone"] == "+15551234567"


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
