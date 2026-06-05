# Backend runtime environment variables

## User-facing email flows (Postmark)

These variables are required for signup verification, signup admin notifications, Contact Us admin notifications, and Contact Us user confirmations:

- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL` (set to `noreply@camos.app`)
- `ADMIN_NOTIFY_EMAIL` (set to `ali@camos.app`)
- `POSTMARK_EMAIL_ENDPOINT` (optional; defaults to Postmark `/email`, primarily for runtime verification against a local provider stub)

If any required variable is missing, email-dependent endpoints return an explicit `503` configuration error instead of reporting success while silently skipping email delivery.
