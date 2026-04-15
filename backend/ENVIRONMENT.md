# Backend runtime environment variables

## Signup email verification (Postmark)

These variables are required for the mandatory email-verification signup flow:

- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL` (set to `noreply@camos.app`)
- `ADMIN_NOTIFY_EMAIL` (set to `ali@camos.app`)

If any required variable is missing, signup email endpoints return an explicit `503` configuration error.
