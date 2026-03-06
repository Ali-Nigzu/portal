"""
Database operations for camOS Analytics API
JSON file-based storage with atomic writes
"""

import os
import json
import tempfile
import shutil
from typing import Dict
import hashlib
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from backend.app.config import (
    USERS_FILE,
    ALARM_LOGS_FILE,
    DEVICE_LISTS_FILE,
    PENDING_SIGNUPS_FILE,
    PENDING_SETTINGS_UNLOCKS_FILE,
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


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_user_by_email(users: dict, email: str):
    normalized = normalize_email(email)
    for username, user_data in users.items():
        user_email = user_data.get("email")
        if isinstance(user_email, str) and normalize_email(user_email) == normalized:
            return username, user_data
    return None, None


def create_account_user(
    users: dict,
    name: str,
    email: str,
    phone: str | None,
    password: str,
    *,
    password_is_hashed: bool = False,
):
    now = datetime.now(timezone.utc).isoformat()
    user_id = str(uuid4())
    username = f"u_{user_id.replace('-', '')[:12]}"
    normalized_email = normalize_email(email)
    password_hash = password if password_is_hashed else hash_password(password)
    users[username] = {
        "id": user_id,
        "name": name,
        "email": normalized_email,
        "phone": phone,
        "password_hash": password_hash,
        "password": password_hash,
        "created_at": now,
        "updated_at": now,
        "last_login": now,
        "role": "client",
        "data_sources": [],
    }
    return username, users[username]


def load_users():
    """Load user credentials from JSON file"""
    if not os.path.exists(USERS_FILE):
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        users_data = {
            "admin": {
                "password": hash_password("admin123"),
                "role": "admin",
                "name": "System Administrator",
                "orgId": "client1",
                "last_login": None,
                "data_sources": []
            },
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


def load_pending_signups() -> dict:
    """Load pending signup records from JSON file."""
    if not os.path.exists(PENDING_SIGNUPS_FILE):
        return {}
    with open(PENDING_SIGNUPS_FILE, 'r') as f:
        return json.load(f)


def save_pending_signups(pending_data: dict):
    """Save pending signup data to JSON file using atomic write."""
    file_dir = os.path.dirname(PENDING_SIGNUPS_FILE) or '.'
    os.makedirs(file_dir, exist_ok=True)

    temp_fd, temp_path = tempfile.mkstemp(dir=file_dir, suffix='.tmp')
    try:
        with os.fdopen(temp_fd, 'w') as f:
            json.dump(pending_data, f, indent=2)
        shutil.move(temp_path, PENDING_SIGNUPS_FILE)
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


def save_alarm_logs(alarm_data: dict):
    """Save alarm logs to JSON file"""
    os.makedirs(os.path.dirname(ALARM_LOGS_FILE), exist_ok=True)
    with open(ALARM_LOGS_FILE, 'w') as f:
        json.dump(alarm_data, f, indent=2)


def load_device_lists():
    """Load device lists from JSON file"""
    if not os.path.exists(DEVICE_LISTS_FILE):
        return {}
    with open(DEVICE_LISTS_FILE, 'r') as f:
        return json.load(f)


def save_device_lists(device_data: dict):
    """Save device lists to JSON file"""
    os.makedirs(os.path.dirname(DEVICE_LISTS_FILE), exist_ok=True)
    with open(DEVICE_LISTS_FILE, 'w') as f:
        json.dump(device_data, f, indent=2)


def load_pending_settings_unlocks() -> dict:
    """Load pending settings unlock records from JSON file."""
    if not os.path.exists(PENDING_SETTINGS_UNLOCKS_FILE):
        return {}
    with open(PENDING_SETTINGS_UNLOCKS_FILE, 'r') as f:
        return json.load(f)


def save_pending_settings_unlocks(pending_data: dict):
    """Save pending settings unlock data to JSON file using atomic write."""
    file_dir = os.path.dirname(PENDING_SETTINGS_UNLOCKS_FILE) or '.'
    os.makedirs(file_dir, exist_ok=True)

    temp_fd, temp_path = tempfile.mkstemp(dir=file_dir, suffix='.tmp')
    try:
        with os.fdopen(temp_fd, 'w') as f:
            json.dump(pending_data, f, indent=2)
        shutil.move(temp_path, PENDING_SETTINGS_UNLOCKS_FILE)
    except Exception as e:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise e
