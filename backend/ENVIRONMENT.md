# Backend runtime environment variables

## User-facing email flows (Postmark)

These variables are required for signup verification, Contact Us admin notifications, and Contact Us user confirmations:

- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL` (set to `noreply@camos.app`)
- `ADMIN_NOTIFY_EMAIL` (optional; defaults to `ali@camos.app`)
- `POSTMARK_EMAIL_ENDPOINT` (optional; defaults to Postmark `/email`, primarily for runtime verification against a local provider stub)

If Postmark credentials are missing, email-dependent endpoints return an explicit `503` configuration error instead of reporting success while silently skipping email delivery. Signup admin-notification failures are logged after account creation so they cannot block verification completion.
