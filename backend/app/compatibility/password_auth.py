"""Historical credentials for compatibility endpoints only; never canonical sessions."""

import hashlib
import os
import secrets
from fastapi import HTTPException

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash."""
    try:
        if stored_hash.startswith("pbkdf2_sha256$"):
            _, iterations, salt, digest = stored_hash.split("$", 3)
            computed = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt.encode("utf-8"),
                int(iterations),
            ).hex()
            return secrets.compare_digest(computed, digest)

        if ':' not in stored_hash:
            return password == stored_hash

        salt, hash_part = stored_hash.split(':', 1)
        password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
        return secrets.compare_digest(password_hash, hash_part)
    except Exception:
        return False

def require_legacy_password_auth():
    if os.getenv("PORTAL_LEGACY_PASSWORD_AUTH", "").lower() != "true" or os.getenv("NODE_ENV") == "production":
        raise HTTPException(410, "Legacy password authentication is disabled")
