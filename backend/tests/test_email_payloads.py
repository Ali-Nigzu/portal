from backend.app.services import postmark_email


def test_signup_admin_notification_payload(monkeypatch):
    sent = []
    monkeypatch.setenv("POSTMARK_SERVER_TOKEN", "token")
    monkeypatch.setenv("POSTMARK_FROM_EMAIL", "noreply@camos.app")
    monkeypatch.delenv("ADMIN_NOTIFY_EMAIL", raising=False)
    monkeypatch.setenv("APP_ENV", "test")

    def capture_send(**kwargs):
        sent.append(kwargs)
        return postmark_email.PostmarkSendResult(
            message_id="signup-message-id",
            submitted_at="2026-06-05T00:00:00Z",
            to_email_masked="al***@camos.app",
        )

    monkeypatch.setattr(postmark_email, "_postmark_send", capture_send)

    result = postmark_email.send_admin_signup_notification(
        verified_email="new-user@example.com",
        name="New User",
        username="new-user",
        timestamp="2026-06-05T12:00:00+00:00",
        phone="+15551234567",
    )

    assert result.message_id == "signup-message-id"
    payload = sent[0]["payload"]
    assert payload["To"] == "ali@camos.app"
    assert payload["Subject"] == "New camOS Signup"
    assert "Name: New User" in payload["TextBody"]
    assert "Email: new-user@example.com" in payload["TextBody"]
    assert "Company: Not captured" in payload["TextBody"]
    assert "Signup timestamp (UTC): 2026-06-05T12:00:00+00:00" in payload["TextBody"]
    assert "Environment: test" in payload["TextBody"]
    assert "Phone: +15551234567" in payload["TextBody"]
    assert "Source: Signup verification" in payload["TextBody"]


def test_contact_email_payloads(monkeypatch):
    sent = []
    monkeypatch.setenv("POSTMARK_SERVER_TOKEN", "token")
    monkeypatch.setenv("POSTMARK_FROM_EMAIL", "noreply@camos.app")
    monkeypatch.setenv("ADMIN_NOTIFY_EMAIL", "ali@camos.app")

    def capture_send(**kwargs):
        sent.append(kwargs)
        return postmark_email.PostmarkSendResult(
            message_id=f"message-{len(sent)}",
            submitted_at="2026-06-05T00:00:00Z",
            to_email_masked="masked@example.com",
        )

    monkeypatch.setattr(postmark_email, "_postmark_send", capture_send)

    admin_result = postmark_email.send_admin_contact_notification(
        name="Contact User",
        email="contact@example.com",
        phone="+15551234567",
        message="Camera deployment question.",
        submitted_at="2026-06-05T12:30:00+00:00",
        attachment_names=[],
        attachments=[],
    )
    confirmation_result = postmark_email.send_contact_confirmation_email(
        to_email="contact@example.com",
        name="Contact User",
    )

    assert admin_result.message_id == "message-1"
    assert confirmation_result.message_id == "message-2"
    admin_payload = sent[0]["payload"]
    assert admin_payload["To"] == "ali@camos.app"
    assert admin_payload["Subject"] == "New camOS Contact Request"
    assert "Name: Contact User" in admin_payload["TextBody"]
    assert "Email: contact@example.com" in admin_payload["TextBody"]
    assert "Phone: +15551234567" in admin_payload["TextBody"]
    assert "Company: Not supplied" in admin_payload["TextBody"]
    assert "Submission timestamp (UTC): 2026-06-05T12:30:00+00:00" in admin_payload["TextBody"]
    assert "Camera deployment question." in admin_payload["TextBody"]

    confirmation_payload = sent[1]["payload"]
    assert confirmation_payload["To"] == "contact@example.com"
    assert confirmation_payload["Subject"] == "We've received your message"
    assert "Hi Contact User," in confirmation_payload["TextBody"]
    assert "Thank you for contacting camOS." in confirmation_payload["TextBody"]
    assert "Camera Operating Systems" in confirmation_payload["TextBody"]
