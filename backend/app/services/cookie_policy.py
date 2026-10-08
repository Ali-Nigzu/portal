"""Shared Secure policy; cookie names, paths, TTLs and SameSite remain domain-owned."""

import os

def session_cookie_secure() -> bool:
    return os.getenv("PORTAL_SESSION_SECURE", "").lower() == "true" or (
        not os.getenv("PORTAL_SESSION_SECURE") and os.getenv("NODE_ENV") == "production"
    )
