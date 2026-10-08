"""Historical JSON client records for compatibility APIs only.
Never a canonical customer, lifecycle, membership or Admin authority."""

import os
import json
import tempfile
import shutil
import hashlib
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from backend.app.compatibility.config import (
    USERS_FILE,
    ALARM_LOGS_FILE,
    DEVICE_LISTS_FILE,
)


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-SHA256 with salt."""
    salt = secrets.token_hex(16)
    iterations = 200_000
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def load_users():
    """Load user credentials from JSON file"""
    if not os.path.exists(USERS_FILE):
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        users_data = {
            "client1": {
                "password": hash_password("client123"),
                "role": "client",
                "name": "Test Client 1",
                "orgId": "client1",
                "last_login": None,
                "data_sources": []
            },
            "client2": {
                "password": hash_password("client456"),
                "role": "client",
                "name": "Test Client 2",
                "orgId": "client2",
                "last_login": None,
                "data_sources": []
            }
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(users_data, f, indent=2)
        return users_data
    
    with open(USERS_FILE, 'r') as f:
        users = json.load(f)
    
    modified = False
    for username, user_data in users.items():
        if 'last_login' not in user_data:
            user_data['last_login'] = None
            modified = True
        if 'data_sources' not in user_data:
            user_data['data_sources'] = []
            modified = True
        if 'orgId' not in user_data and 'org_id' not in user_data:
            if user_data.get('role') == 'client':
                user_data['orgId'] = username
            else:
                user_data['orgId'] = 'client1'
            modified = True
        if 'id' not in user_data:
            user_data['id'] = str(uuid4())
            modified = True
        if 'email' not in user_data:
            user_data['email'] = f"{username}@local.invalid"
            modified = True
        if 'phone' not in user_data:
            user_data['phone'] = None
            modified = True
        if 'created_at' not in user_data:
            user_data['created_at'] = datetime.now(timezone.utc).isoformat()
            modified = True
        if 'updated_at' not in user_data:
            user_data['updated_at'] = datetime.now(timezone.utc).isoformat()
            modified = True
        if 'password_hash' not in user_data and 'password' in user_data:
            user_data['password_hash'] = user_data['password']
            modified = True
    
    if modified:
        save_users(users)
    
    return users


def save_users(users_data: dict):
    """Save users data to JSON file using atomic write"""
    file_dir = os.path.dirname(USERS_FILE) or '.'
    os.makedirs(file_dir, exist_ok=True)
    
    temp_fd, temp_path = tempfile.mkstemp(dir=file_dir, suffix='.tmp')
    try:
        with os.fdopen(temp_fd, 'w') as f:
            json.dump(users_data, f, indent=2)
        shutil.move(temp_path, USERS_FILE)
    except Exception as e:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise e


def load_alarm_logs():
    """Load alarm logs from JSON file"""
    if not os.path.exists(ALARM_LOGS_FILE):
        return {}
    with open(ALARM_LOGS_FILE, 'r') as f:
        return json.load(f)


def load_device_lists():
    """Load device lists from JSON file"""
    if not os.path.exists(DEVICE_LISTS_FILE):
        return {}
    with open(DEVICE_LISTS_FILE, 'r') as f:
        return json.load(f)


